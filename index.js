var genericPool = require('generic-pool')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var objectAssign = require('object-assign')

// there is a bug in the generic pool where it will not recreate
// destroyed workers (even if there is waiting work to do) unless
// there is a min specified. Make sure we keep some connections
// SEE: https://github.com/coopernurse/node-pool/pull/186
// SEE: https://github.com/brianc/node-pg-pool/issues/48
// SEE: https://github.com/strongloop/loopback-connector-postgresql/issues/231
function _ensureMinimum () {
  var i, diff, waiting
  if (this._draining) return
  waiting = this._waitingClients.size()
  if (this._factory.min > 0) { // we have positive specified minimum
    diff = this._factory.min - this._count
  } else if (waiting > 0) { // we have no minimum, but we do have work to do
    diff = Math.min(waiting, this._factory.max - this._count)
  }
  for (i = 0; i < diff; i++) {
    this._createResource()
  }
};

var Pool = module.exports = function (options, Client) {
  if (!(this instanceof Pool)) {
    return new Pool(options, Client)
  }
  EventEmitter.call(this)
  this.options = objectAssign({}, options)
  this.log = this.options.log || function () { }
  this.Client = this.options.Client || Client || require('pg').Client
  this.Promise = this.options.Promise || global.Promise

  this.options.max = this.options.max || this.options.poolSize || 10
  this.options.create = this.options.create || this._create.bind(this)
  this.options.destroy = this.options.destroy || this._destroy.bind(this)
  this.pool = new genericPool.Pool(this.options)
  // Monkey patch to ensure we always finish our work
  //  - There is a bug where callbacks go uncalled if min is not set
  //  - We might still not want a connection to *always* exist
  //  - but we do want to create up to max connections if we have work
  //  - still waiting
  // This should be safe till the version of pg-pool is upgraded
  // SEE: https://github.com/coopernurse/node-pool/pull/186
  this.pool._ensureMinimum = _ensureMinimum
  this.onCreate = this.options.onCreate
}

util.inherits(Pool, EventEmitter)

Pool.prototype._promise = function (cb, executor) {
  if (!cb) {
    return new this.Promise(executor)
  }

  function resolved (value) {
    process.nextTick(function () {
      cb(null, value)
    })
  }

  function rejected (error) {
    process.nextTick(function () {
      cb(error)
    })
  }

  executor(resolved, rejected)
}

Pool.prototype._promiseNoCallback = function (callback, executor) {
  return callback
    ? executor()
    : new this.Promise(executor)
}

Pool.prototype._destroy = function (client) {
  if (client._destroying) return
  client._destroying = true
  client.end()
}

Pool.prototype._create = function (cb) {
  this.log('connecting new client')
  var client = new this.Client(this.options)

  client.on('error', function (e) {
    this.log('connected client error:', e)
    this.pool.destroy(client)
    e.client = client
    this.emit('error', e, client)
  }.bind(this))

  client.connect(function (err) {
    if (err) {
      this.log('client connection error:', err)
      cb(err, null)
    } else {
      this.log('client connected')
      this.emit('connect', client)
      cb(null, client)
    }
  }.bind(this))
}

Pool.prototype.connect = function (cb) {
  return this._promiseNoCallback(cb, function (resolve, reject) {
    this.log('acquire client begin')
    this.pool.acquire(function (err, client) {
      if (err) {
        this.log('acquire client. error:', err)
        if (cb) {
          cb(err, null, function () {})
        } else {
          reject(err)
        }
        return
      }

      this.log('acquire client')
      this.emit('acquire', client)

      client.release = function (err) {
        delete client.release
        if (err) {
          this.log('destroy client. error:', err)
          this.pool.destroy(client)
        } else {
          this.log('release client')
          this.pool.release(client)
        }
      }.bind(this)

      if (cb) {
        cb(null, client, client.release)
      } else {
        resolve(client)
      }
    }.bind(this))
  }.bind(this))
}

Pool.prototype.take = Pool.prototype.connect

Pool.prototype.query = function (text, values, cb) {
  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  return this._promise(cb, function (resolve, reject) {
    this.connect(function (err, client, done) {
      if (err) {
        return reject(err)
      }
      client.query(text, values, function (err, res) {
        done(err)
        err ? reject(err) : resolve(res)
      })
    })
  }.bind(this))
}

Pool.prototype.end = function (cb) {
  this.log('draining pool')
  return this._promise(cb, function (resolve, reject) {
    this.pool.drain(function () {
      this.log('pool drained, calling destroy all now')
      this.pool.destroyAllNow(resolve)
    }.bind(this))
  }.bind(this))
}

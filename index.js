var genericPool = require('generic-pool')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var objectAssign = require('object-assign')

var Pool = module.exports = function (options, Client) {
  if (!(this instanceof Pool)) {
    return new Pool(options, Client)
  }
  EventEmitter.call(this)
  this.options = objectAssign({}, options)
  this.log = this.options.log || function () { }
  this.Client = this.options.Client || Client || require('pg').Client
  this.Promise = this.options.Promise || Promise

  this.options.max = this.options.max || this.options.poolSize || 10
  this.options.create = this.options.create || this._create.bind(this)
  this.options.destroy = this.options.destroy || this._destroy.bind(this)
  this.pool = new genericPool.Pool(this.options)
  this.onCreate = this.options.onCreate
}

util.inherits(Pool, EventEmitter)

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
    this.emit('error', e)
  }.bind(this))

  client.connect(function (err) {
    if (err) {
      this.log('client connection error:', err)
      cb(err)
    } else {
      this.log('client connected')
      this.emit('connect', client)
      cb(null, client)
    }
  }.bind(this))
}

Pool.prototype.connect = function (cb) {
  return new this.Promise(function (resolve, reject) {
    this.log('acquire client begin')
    this.pool.acquire(function (err, client) {
      if (err) {
        this.log('acquire client. error:', err)
        if (cb) {
          cb(err, null, function () {})
        }
        return reject(err)
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
      }

      return resolve(client)
    }.bind(this))
  }.bind(this))
}

Pool.prototype.take = Pool.prototype.connect

Pool.prototype.query = function (text, values, cb) {
  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  return new this.Promise(function (resolve, reject) {
    this.connect(function (err, client, done) {
      if (err) {
        if (cb) {
          cb(err)
        }
        return reject(err)
      }
      client.query(text, values, function (err, res) {
        done(err)
        err ? reject(err) : resolve(res)
        if (cb) {
          cb(err, res)
        }
      })
    })
  }.bind(this))
}

Pool.prototype.end = function (cb) {
  this.log('draining pool')
  return new this.Promise(function (resolve, reject) {
    this.pool.drain(function () {
      this.log('pool drained, calling destroy all now')
      this.pool.destroyAllNow(function () {
        if (cb) {
          cb()
        }
        resolve()
      })
    }.bind(this))
  }.bind(this))
}

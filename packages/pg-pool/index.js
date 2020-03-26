'use strict'
const EventEmitter = require('events').EventEmitter

const NOOP = function () { }

const removeWhere = (list, predicate) => {
  const i = list.findIndex(predicate)

  return i === -1
    ? undefined
    : list.splice(i, 1)[0]
}

class ClientItem {
  constructor(client, useCount) {
    this.client = client
    this.useCount = useCount
  }
}

class IdleItem {
  constructor (clientItem, idleListener, timeoutId) {
    this.clientItem = clientItem
    this.idleListener = idleListener
    this.timeoutId = timeoutId
  }
}

class PendingItem {
  constructor (callback) {
    this.callback = callback
  }
}

function throwOnDoubleRelease () {
  throw new Error('Release called on client which has already been released to the pool.')
}

function promisify (Promise, callback) {
  if (callback) {
    return { callback: callback, result: undefined }
  }
  let rej
  let res
  const cb = function (err, client) {
    err ? rej(err) : res(client)
  }
  const result = new Promise(function (resolve, reject) {
    res = resolve
    rej = reject
  })
  return { callback: cb, result: result }
}

function makeIdleListener (pool, clientItem) {
  return function idleListener (err) {
    err.client = clientItem.client

    clientItem.client.removeListener('error', idleListener)
    clientItem.client.on('error', () => {
      pool.log('additional client error after disconnection due to error', err)
    })
    pool._remove(clientItem)
    // TODO - document that once the pool emits an error
    // the client has already been closed & purged and is unusable
    pool.emit('error', err, clientItem.client)
  }
}

class Pool extends EventEmitter {
  constructor (options, Client) {
    super()
    this.options = Object.assign({}, options)
    this.options.max = this.options.max || this.options.poolSize || 10
    this.options.maxUses = this.options.maxUses || Infinity
    this.log = this.options.log || function () { }
    this.Client = this.options.Client || Client || require('pg').Client
    this.Promise = this.options.Promise || global.Promise

    if (typeof this.options.idleTimeoutMillis === 'undefined') {
      this.options.idleTimeoutMillis = 10000
    }

    this._clients = []
    this._idle = []
    this._pendingQueue = []
    this._endCallback = undefined
    this.ending = false
    this.ended = false
  }

  _isFull () {
    return this._clients.length >= this.options.max
  }

  _pulseQueue () {
    this.log('pulse queue')
    if (this.ended) {
      this.log('pulse queue ended')
      return
    }
    if (this.ending) {
      this.log('pulse queue on ending')
      if (this._idle.length) {
        this._idle.slice().map(item => {
          this._remove(item.clientItem)
        })
      }
      if (!this._clients.length) {
        this.ended = true
        this._endCallback()
      }
      return
    }
    // if we don't have any waiting, do nothing
    if (!this._pendingQueue.length) {
      this.log('no queued requests')
      return
    }
    // if we don't have any idle clients and we have no more room do nothing
    if (!this._idle.length && this._isFull()) {
      return
    }
    const pendingItem = this._pendingQueue.shift()
    if (this._idle.length) {
      const idleItem = this._idle.pop()
      clearTimeout(idleItem.timeoutId)
      const clientItem = idleItem.clientItem
      const idleListener = idleItem.idleListener

      return this._acquireClient(clientItem, pendingItem, idleListener, false)
    }
    if (!this._isFull()) {
      return this.newClient(pendingItem)
    }
    throw new Error('unexpected condition')
  }

  _remove (clientItem) {
    const removed = removeWhere(
      this._idle,
      item => item.clientItem === clientItem
    )

    if (removed !== undefined) {
      clearTimeout(removed.timeoutId)
    }

    this._clients = this._clients.filter(c => c !== clientItem)
    clientItem.client.end()
    this.emit('remove', clientItem.client)
  }

  connect (cb) {
    if (this.ending) {
      const err = new Error('Cannot use a pool after calling end on the pool')
      return cb ? cb(err) : this.Promise.reject(err)
    }

    const response = promisify(this.Promise, cb)
    const result = response.result

    // if we don't have to connect a new client, don't do so
    if (this._clients.length >= this.options.max || this._idle.length) {
      // if we have idle clients schedule a pulse immediately
      if (this._idle.length) {
        process.nextTick(() => this._pulseQueue())
      }

      if (!this.options.connectionTimeoutMillis) {
        this._pendingQueue.push(new PendingItem(response.callback))
        return result
      }

      const queueCallback = (err, res, done) => {
        clearTimeout(tid)
        response.callback(err, res, done)
      }

      const pendingItem = new PendingItem(queueCallback)

      // set connection timeout on checking out an existing client
      const tid = setTimeout(() => {
        // remove the callback from pending waiters because
        // we're going to call it with a timeout error
        removeWhere(this._pendingQueue, (i) => i.callback === queueCallback)
        pendingItem.timedOut = true
        response.callback(new Error('timeout exceeded when trying to connect'))
      }, this.options.connectionTimeoutMillis)

      this._pendingQueue.push(pendingItem)
      return result
    }

    this.newClient(new PendingItem(response.callback))

    return result
  }

  newClient (pendingItem) {
    const client = new this.Client(this.options)
    const clientItem = new ClientItem(client, 0)
    this._clients.push(clientItem)
    const idleListener = makeIdleListener(this, clientItem)

    this.log('checking client timeout')

    // connection timeout logic
    let tid
    let timeoutHit = false
    if (this.options.connectionTimeoutMillis) {
      tid = setTimeout(() => {
        this.log('ending client due to timeout')
        timeoutHit = true
        // force kill the node driver, and let libpq do its teardown
        client.connection ? client.connection.stream.destroy() : client.end()
      }, this.options.connectionTimeoutMillis)
    }

    this.log('connecting new client')
    client.connect((err) => {
      if (tid) {
        clearTimeout(tid)
      }
      client.on('error', idleListener)
      if (err) {
        this.log('client failed to connect', err)
        // remove the dead client from our list of clients
        this._clients = this._clients.filter(c => c !== clientItem)
        if (timeoutHit) {
          err.message = 'Connection terminated due to connection timeout'
        }

        // this client won’t be released, so move on immediately
        this._pulseQueue()

        if (!pendingItem.timedOut) {
          pendingItem.callback(err, undefined, NOOP)
        }
      } else {
        this.log('new client connected')
        return this._acquireClient(clientItem, pendingItem, idleListener, true)
      }
    })
  }

  // acquire a client for a pending work item
  _acquireClient (clientItem, pendingItem, idleListener, isNew) {
    if (isNew) {
      this.emit('connect', clientItem.client)
    }

    this.emit('acquire', clientItem.client)

    let released = false

    clientItem.useCount += 1

    clientItem.client.release = (err) => {
      if (released) {
        throwOnDoubleRelease()
      }

      released = true
      this._release(clientItem, idleListener, err)
    }

    clientItem.client.removeListener('error', idleListener)

    if (!pendingItem.timedOut) {
      if (isNew && this.options.verify) {
        this.options.verify(clientItem.client, (err) => {
          if (err) {
            clientItem.client.release(err)
            return pendingItem.callback(err, undefined, NOOP)
          }

          pendingItem.callback(undefined, clientItem.client, clientItem.client.release)
        })
      } else {
        pendingItem.callback(undefined, clientItem.client, clientItem.client.release)
      }
    } else {
      if (isNew && this.options.verify) {
        this.options.verify(clientItem.client, clientItem.client.release)
      } else {
        clientItem.client.release()
      }
    }
  }

  // release a client back to the poll, include an error
  // to remove it from the pool
  _release (clientItem, idleListener, err) {
    clientItem.client.on('error', idleListener)

    // TODO(bmc): expose a proper, public interface _queryable and _ending
    if (err || this.ending || !clientItem.client._queryable || clientItem.client._ending || clientItem.useCount >= this.options.maxUses) {
      if (clientItem.useCount >= this.options.maxUses) {
        this.log('removing expended client')
      }
      this._remove(clientItem)
      this._pulseQueue()
      return
    }

    // idle timeout
    let tid
    if (this.options.idleTimeoutMillis) {
      tid = setTimeout(() => {
        this.log('remove idle client')
        this._remove(clientItem)
      }, this.options.idleTimeoutMillis)
    }

    this._idle.push(new IdleItem(clientItem, idleListener, tid))
    this._pulseQueue()
  }

  query (text, values, cb) {
    // guard clause against passing a function as the first parameter
    if (typeof text === 'function') {
      const response = promisify(this.Promise, text)
      setImmediate(function () {
        return response.callback(new Error('Passing a function as the first parameter to pool.query is not supported'))
      })
      return response.result
    }

    // allow plain text query without values
    if (typeof values === 'function') {
      cb = values
      values = undefined
    }
    const response = promisify(this.Promise, cb)
    cb = response.callback

    this.connect((err, client) => {
      if (err) {
        return cb(err)
      }

      let clientReleased = false
      const onError = (err) => {
        if (clientReleased) {
          return
        }
        clientReleased = true
        client.release(err)
        cb(err)
      }

      client.once('error', onError)
      this.log('dispatching query')
      client.query(text, values, (err, res) => {
        this.log('query dispatched')
        client.removeListener('error', onError)
        if (clientReleased) {
          return
        }
        clientReleased = true
        client.release(err)
        if (err) {
          return cb(err)
        } else {
          return cb(undefined, res)
        }
      })
    })
    return response.result
  }

  end (cb) {
    this.log('ending')
    if (this.ending) {
      const err = new Error('Called end on pool more than once')
      return cb ? cb(err) : this.Promise.reject(err)
    }
    this.ending = true
    const promised = promisify(this.Promise, cb)
    this._endCallback = promised.callback
    this._pulseQueue()
    return promised.result
  }

  get waitingCount () {
    return this._pendingQueue.length
  }

  get idleCount () {
    return this._idle.length
  }

  get totalCount () {
    return this._clients.length
  }
}
module.exports = Pool

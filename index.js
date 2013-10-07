var path = require('path')

var resultPath = path.dirname(require.resolve('pg.js')) + '/lib/result'
var Result = require(resultPath)
var Client = require('pg.js').Client

var Cursor = function(text, values) {
  this.text = text
  this.values = values
  this._connection = null
}

Cursor.prototype._connect = function(cb) {
  if(this._connected) return setImmediate(cb);
  this._connected = true
  var self = this
  var client = new Client()
  client.connect(function(err) {
    if(err) return cb(err);

    //remove all listeners from
    //client's connection and discard the client
    self.connection = client.connection
    self.connection.removeAllListeners()

    var con = self.connection

    con.parse({
      text: self.text
    }, true)

    con.bind({
      values: self.values
    }, true)

    con.describe({
      type: 'P',
      name: '' //use unamed portal
    }, true)

    con.flush()

    var onError = function(err) {
      cb(err)
      con.end()
    }

    con.once('error', onError)

    con.on('rowDescription', function(msg) {
      self.rowDescription = msg
      con.removeListener('error', onError)
      cb(null, con)
    })

    var onRow = function(msg) {
      var row = self.result.parseRow(msg.fields)
      self.result.addRow(row)
    }

    con.on('dataRow', onRow)

    con.once('readyForQuery', function() {
      con.end()
    })

    con.once('commandComplete', function() {
      self._complete = true
      con.sync()
    })
  })
}

Cursor.prototype._getRows = function(con, n, cb) {
  if(this._done) {
    return cb(null, [], false)
  }
  var msg = {
    portal: '',
    rows: n
  }
  con.execute(msg, true)
  con.flush()
  this.result = new Result()
  this.result.addFields(this.rowDescription.fields)

  var self = this

  var onComplete = function() {
    self._done = true
    cb(null, self.result.rows, self.result)
  }
  con.once('commandComplete', onComplete)

  con.once('portalSuspended', function() {
    cb(null, self.result.rows, self.result)
    con.removeListener('commandComplete', onComplete)
  })
}

Cursor.prototype.end = function(cb) {
  this.connection.end()
  this.connection.stream.once('end', cb)
}

Cursor.prototype.read = function(rows, cb) {
  var self = this
  this._connect(function(err) {
    if(err) return cb(err);
    self._getRows(self.connection, rows, cb)
  })
}

module.exports = function(query, params) {
  return new Cursor(query, params)
}

var Result = require('./pg').Result
var prepare = require('./pg').prepareValue

var Cursor = function(text, values) {
  this.text = text
  this.values = values ? values.map(prepare) : null
  this.connection = null
  this._queue = []
  this.state = 'initialized'
  this._result = new Result()
  this._cb = null
  this._rows = null
}

Cursor.prototype.submit = function(connection) {
  this.connection = connection

  var con = connection
  var self = this

  con.parse({
    text: this.text
  }, true)

  con.bind({
    values: this.values
  }, true)

  con.describe({
    type: 'P',
    name: '' //use unamed portal
  }, true)

  con.flush()

  con.once('noData', ifNoData)
  con.once('rowDescription', function () {
    con.removeListener('noData', ifNoData);
  });

  function ifNoData () {
    self.state = 'idle'
    self._shiftQueue();
  }
}

Cursor.prototype._shiftQueue = function () {
  if(this._queue.length) {
    this._getRows.apply(this, this._queue.shift())
  }
}

Cursor.prototype.handleRowDescription = function(msg) {
  this._result.addFields(msg.fields)
  this.state = 'idle'
  this._shiftQueue();
}

Cursor.prototype.handleDataRow = function(msg) {
  var row = this._result.parseRow(msg.fields)
  this._rows.push(row)
}

Cursor.prototype._sendRows = function() {
  this.state = 'idle'
  setImmediate(function() {
    var cb = this._cb
    //remove callback before calling it
    //because likely a new one will be added
    //within the call to this callback
    this._cb = null
    if(cb) {
      cb(null, this._rows)
    }
    this._rows = []
  }.bind(this))
}

Cursor.prototype.handleCommandComplete = function() {
  this.connection.sync()
}

Cursor.prototype.handlePortalSuspended = function() {
  this._sendRows()
}

Cursor.prototype.handleReadyForQuery = function() {
  this._sendRows()
  this.state = 'done'
}

Cursor.prototype.handleError = function(msg) {
  this.state = 'error'
  this._error = msg
  //satisfy any waiting callback
  if(this._cb) {
    this._cb(msg)
  }
  //dispatch error to all waiting callbacks
  for(var i = 0; i < this._queue.length; i++) {
    this._queue.pop()[1](msg)
  }
  //call sync to keep this connection from hanging
  this.connection.sync()
}

Cursor.prototype._getRows = function(rows, cb) {
  this.state = 'busy'
  this._cb = cb
  this._rows = []
  var msg = {
    portal: '',
    rows: rows
  }
  this.connection.execute(msg, true)
  this.connection.flush()
}

Cursor.prototype.end = function(cb) {
  if(this.state != 'initialized') {
    this.connection.sync()
  }
  this.connection.end()
  this.connection.stream.once('end', cb)
}

Cursor.prototype.read = function(rows, cb) {
  var self = this
  if(this.state == 'idle') {
    return this._getRows(rows, cb)
  }
  if(this.state == 'busy' || this.state == 'initialized') {
    return this._queue.push([rows, cb])
  }
  if(this.state == 'error') {
    return cb(this._error)
  }
  if(this.state == 'done') {
    return cb(null, [])
  }
  else {
    throw new Error("Unknown state: " + this.state)
  }
}

module.exports = Cursor

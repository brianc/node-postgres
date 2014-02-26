var util = require('util')
var Cursor = require('pg-cursor')
var Readable = require('stream').Readable

var QueryStream = module.exports = function(text, values, options) {
  options = options || { }
  Cursor.call(this, text, values)
  Readable.call(this, {
    objectMode: true,
    highWaterMark: options.highWaterMark || 1000
  })
  this.batchSize = options.batchSize || 100
  this._ready = false
  //kick reader
  this.read()
}

util.inherits(QueryStream, Readable)
for(var key in Cursor.prototype) {
  if(key != 'read') {
    QueryStream.prototype[key] = Cursor.prototype[key]
  }
}

QueryStream.prototype._fetch = Cursor.prototype.read

QueryStream.prototype._read = function(n) {
  if(this._reading) return false;
  this._reading = true
  var self = this
  this._fetch(this.batchSize, function(err, rows) {
    if(err) {
      return self.emit('error', err)
    }
    if(!rows.length) {
      setImmediate(function() {
        self.push(null)
        self.once('end', self.emit.bind(self, 'close'))
      })
    }
    self._reading = false
    for(var i = 0; i < rows.length; i++) {
      self.push(rows[i])
    }
  })
}

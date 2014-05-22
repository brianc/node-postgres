var util = require('util')
var Cursor = require('pg-cursor')
var Readable = require('readable-stream').Readable

var QueryStream = module.exports = function(text, values, options) {
  var self = this;
  options = options || { }
  Cursor.call(this, text, values)
  Readable.call(this, {
    objectMode: true,
    highWaterMark: options.highWaterMark || 1000
  })
  this.batchSize = options.batchSize || 100
  this.once('end', function() {
    process.nextTick(function() {
      self.emit('close') 
    });
   })
}

util.inherits(QueryStream, Readable)
for(var key in Cursor.prototype) {
  if(key == 'read') {
    QueryStream.prototype._fetch = Cursor.prototype.read
  } else {
    QueryStream.prototype[key] = Cursor.prototype[key]
  }
}



QueryStream.prototype._read = function(n) {
  if(this._reading) return false;
  this._reading = true
  var self = this
  this._fetch(this.batchSize, function(err, rows) {
    if(err) {
      return self.emit('error', err)
    }
    if(!rows.length) {
      process.nextTick(function() {
        self.push(null)
      })
      return;
    }
    self._reading = false
    for(var i = 0; i < rows.length; i++) {
      self.push(rows[i])
    }
  })
}

var events = require('events');

if(typeof events.EventEmitter.prototype.once !== 'function') {
  events.EventEmitter.prototype.once = function (type, listener) {
    var self = this;
    self.on(type, function g () {
      self.removeListener(type, g);
      listener.apply(this, arguments);
    });
  };
}
var Pool = function(maxSize, createFn) {
  this.maxSize = maxSize;
  this.createFn = createFn;
  this.items = [];
  this.waits = [];
}

var p = Pool.prototype;

p.checkOut = function(callback) {
  var len = 0;
  for(var i = 0, len = this.items.length; i < len; i++) {
    var item = this.items[i];
    if(item.checkedIn) {
      return this._pulse(item, callback);
    }
  }
  //check if we can create a new item
  if(len < this.maxSize && this.createFn) {
    var item = {ref: this.createFn()}
    this.items.push(item);
    return this._pulse(item, callback)
  }
  this.waits.push(callback);
  return false; //did not execute sync
}

p.checkIn = function(item) {
  //scan current items
  for(var i = 0, len = this.items.length; i < len; i++) {
    var currentItem = this.items[i];
    if(currentItem.ref == item) {
      currentItem.checkedIn = true;
      return this._pulse(currentItem);
    }
  }
  //add new item
  var newItem = {ref: item, checkedIn: true};
  this.items.push(newItem);
  return this._pulse(newItem);
}

p._pulse = function(item, cb) {
  cb = cb || this.waits.pop()
  if(cb) {
    item.checkedIn = false;
    cb(null, item.ref)
    return true;
  }
  return false;
}

module.exports = {
  Pool: Pool
}

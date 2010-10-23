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

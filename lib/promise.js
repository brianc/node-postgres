const util = require('util')
const deprecationMessage = 'Using the promise result as an event emitter is deprecated and will be removed in pg@8.0'
module.exports = function(emitter, callback) {
  const promise = new global.Promise(callback)
  promise.on = util.deprecate(function () {
    emitter.on.apply(emitter, arguments)
  }, deprecationMessage);

  promise.once = util.deprecate(function () {
    emitter.once.apply(emitter, arguments)
  }, deprecationMessage)
}

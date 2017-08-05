// support both pg & pg.js
// this will eventually go away when i break native bindings
// out into their own module
try {
  module.exports.Result = require('pg/lib/result.js')
  module.exports.prepareValue = require('pg/lib/utils.js').prepareValue
} catch (e) {
  module.exports.Result = require('pg.js/lib/result.js')
  module.exports.prepareValue = require('pg.js/lib/utils.js').prepareValue
}

var path = require('path')
var pgPath;
//support both pg & pg.js
//this will eventually go away when i break native bindings
//out into their own module
try {
  pgPath = path.dirname(require.resolve('pg'))
} catch(e) {
  pgPath = path.dirname(require.resolve('pg.js')) + '/lib'
}

module.exports = require(path.join(pgPath, 'result.js'))

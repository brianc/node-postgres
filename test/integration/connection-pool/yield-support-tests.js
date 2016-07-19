var semver = require('semver')
if (semver.lt(process.version, '1.0.0')) {
  return console.log('yield is not supported in node <= v0.12')
}
require('./yield-support-body')


var pgNative = require('pg-native');
assert(semver.gte(pgNative.version, pkg.minNativeVersion));
module.exports = require('./index');

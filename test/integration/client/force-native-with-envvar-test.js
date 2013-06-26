// if (!assert) var assert = require('assert');

process.env.NODE_PG_FORCE_NATIVE = true;

var pg = require('../../../lib/');
var query_native = require('../../../lib/native/query.js');
var query_js = require('../../../lib/query.js');

assert.deepEqual(pg.Client.Query, query_native);
assert.notDeepEqual(pg.Client.Query, query_js);

/**
 * helper needs to be loaded for the asserts but it alos proloads
 * client which we don't want here
 *
 */
var helper = require(__dirname+"/test-helper")
  , path = require('path')
;

var paths = {
  'pg' : path.join(__dirname, '..', '..', '..', 'lib', 'index.js') ,
  'query_js' : path.join(__dirname, '..', '..', '..', 'lib', 'query.js') ,
  'query_native' : path.join(__dirname, '..', '..', '..', 'lib', 'native', 'query.js') ,
};

/**
 * delete the modules we are concerned about from the
 * module cache, so they get loaded cleanly and the env
 * var can kick in ...
 */
function emptyCache(){
  Object.keys(require.cache).forEach(function(key){
    delete require.cache[key];
  });
};

emptyCache();
process.env.NODE_PG_FORCE_NATIVE = '1';

var pg = require( paths.pg );
var query_native = require( paths.query_native );
var query_js = require( paths.query_js );

assert.deepEqual(pg.Client.Query, query_native);
assert.notDeepEqual(pg.Client.Query, query_js);

emptyCache();
delete process.env.NODE_PG_FORCE_NATIVE

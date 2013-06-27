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
 * module cache
 */
function deleteFromCache(){
  Object.keys(paths).forEach(function(module){
    var cache_key = paths[ module ];
    delete require.cache[ cache_key ];
  });
};


deleteFromCache();
process.env.NODE_PG_FORCE_NATIVE = "1";

var pg = require( paths.pg );
var query_native = require( paths.query_native );
var query_js = require( paths.query_js );

assert.deepEqual(pg.Client.Query, query_native);
assert.notDeepEqual(pg.Client.Query, query_js);

deleteFromCache();
delete process.env.NODE_PG_FORCE_NATIVE

var helper = require(__dirname + "/test-helper");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
util.inherits(helper, EventEmitter);

test('connection event', function(){
    var client = null;

    var pool = helper.pg.pools.getOrCreate(helper.config);
    pool.on('connect', function(emittedClient){
        console.log('connect');
    });

    //console.dir(pool);
    helper.pg.connect(helper.config, function(err, client, done){
        client = client;
        //console.log(client);
        setTimeout(function(){
            process.exit();
        }, 1000);
    });

});

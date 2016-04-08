var helper = require(__dirname + "/test-helper");

test('connection event', function(){
    var client = null;

    var pool = helper.pg.pools.getOrCreate(helper.config);
    pool.on('connect', function(emittedClient){
        console.log('connect');
        client = emittedClient;
    });

    // console.dir(pool);

    pool.connect(function(err, cbclient){
        //assert.same(client, cbclient);
        console.log(err);
        console.dir(cbclient);
            setTimeout(function(){
                process.exit();
            }, 1000);
    });


});

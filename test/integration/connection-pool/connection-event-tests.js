var helper = require(__dirname + "/test-helper");

test('connection event', function(){
    var client = null;

    var pool = helper.pg.pools.getOrCreate(helper.config);
    pool.on('connect', function(emittedClient){
        console.log('connect');
        client = emittedClient;
    });

    // console.dir(pool);

    // pool.connect(function(err, cbclient){
    //     assert.same(client, cbclient);
    // });

    helper.pg.connect(helper.config, function(err, cbclient){
        //console.log(cbclient);
        assert.same(client, cbclient);
    });

    // pool.create(function(err, cbclient){
    //     assert.same(client, cbclient);
    // });

    // //console.dir(pool);
    // helper.pg.connect(helper.config, function(err, client, done){
    //     client = client;
    //     //console.log(client);
    //     setTimeout(function(){
    //         process.exit();
    //     }, 1000);
    // });

});

var Pool = require(__dirname + '/utils').Pool;
var defaults =  require(__dirname + '/defaults');

module.exports = {
  init: function(Client) {

    //connection pool global cache
    var clientPools = {
    }

    var connect = function(config, callback) {
      //lookup pool using config as key
      //TODO this don't work so hot w/ object configs
      var pool = clientPools[config];

      //create pool if doesn't exist
      if(!pool) {
        pool = clientPools[config] = new Pool(defaults.poolSize, function() {
          var client = new Client(config);
          client.connected = false;
          return client;
        })
      }

      pool.checkOut(function(err, client) {
        //if client already connected just
        //pass it along to the callback and return
        if(client.connected) {
          callback(null, client);
          return;
        }

        var onError = function(error) {
          client.removeListener('connect', onReady);
          callback(error);
          pool.checkIn(client);
        }

        var onReady = function() {
          client.removeListener('error', onError);
          client.connected = true;
          callback(null, client);
          client.on('drain', function() {
            pool.checkIn(client);
          });
        }

        client.once('error', onError);

        client.once('connect', onReady);

        client.connect();

      });
    }

    //destroys the world
    //or optionally only a single pool
    //mostly used for testing or
    //a hard shutdown
    var end = function(name) {
      if(!name) {
        for(var poolName in clientPools) {
          end(poolName)
          return
        }
      }
      var pool = clientPools[name];
      //log("destroying pool %s", name);
      pool.waits.forEach(function(wait) {
        wait(new Error("Client is being destroyed"))
      })
      pool.waits = [];
      pool.items.forEach(function(item) {
        var client = item.ref;
        if(client.activeQuery) {
          //log("client is still active, waiting for it to complete");
          client.on('drain', client.end.bind(client))
        } else {
          client.end();
        }
      })
      //remove reference to pool lookup
      clientPools[name] = null;
      delete(clientPools[name])
    };
    //export functions with closures to client constructor
    return {
      connect: connect,
      end: end
    }
  }
};

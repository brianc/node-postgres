var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');
var Pool = require(__dirname + '/utils').Pool;
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');

//wrap up common connection management boilerplate
var connect = function(config, callback) {
  if(poolEnabled()) {
    return getPooledClient(config, callback)
  }

  var client = new Client(config);
  client.connect();

  var onError = function(error) {
    client.connection.removeListener('readyForQuery', onReady);
    callback(error);
  }

  var onReady = function() {
    client.removeListener('error', onError);
    callback(null, client);
    client.on('drain', client.end.bind(client));
  }

  client.once('error', onError);

  //TODO refactor
  //i don't like reaching into the client's connection for attaching
  //to specific events here
  client.connection.once('readyForQuery', onReady);
}


//connection pool global cache
var clientPools = {
}

var poolEnabled = function() {
  return defaults.poolSize;
}

var log = function() {
  //do nothing
}

//for testing
// var log = function() {
//   console.log.apply(console, arguments);
// }

var getPooledClient = function(config, callback) {
  //lookup pool using config as key
  //TODO this don't work so hot w/ object configs
  var pool = clientPools[config];

  //create pool if doesn't exist
  if(!pool) {
    //log("creating pool %s", config)
    pool = clientPools[config] = new Pool(defaults.poolSize, function() {
      //log("creating new client in pool %s", config)
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
      client.connection.removeListener('readyForQuery', onReady);
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

    //TODO refactor
    //i don't like reaching into the client's connection for attaching
    //to specific events here
    client.connection.once('readyForQuery', onReady);

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
}


module.exports = {
  Client: Client,
  Connection: require(__dirname + '/connection'),
  connect: connect,
  end: end,
  defaults: defaults
}

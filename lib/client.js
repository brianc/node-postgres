var sys = require('sys');
var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var Query = require(__dirname + '/query');
var utils = require(__dirname + '/utils');

var defaults = require(__dirname + '/defaults');
var Connection = require(__dirname + '/connection');

var parseConnectionString = function(str) {
  var result = url.parse(str);
  result.host = result.hostname;
  result.database = result.pathname.slice(1);
  var auth = (result.auth || ':').split(':');
  result.user = auth[0];
  result.password = auth[1];
  return result;
};

var Client = function(config) {
  EventEmitter.call(this);
  if(typeof config === 'string') {
    config = parseConnectionString(config)
  }
  config = config || {};
  this.user = config.user || defaults.user;
  this.database = config.database || defaults.database;
  this.port = config.port || defaults.port;
  this.host = config.host || defaults.host;
  this.queryQueue = [];
  this.connection = config.connection || new Connection({stream: config.stream || new net.Stream()});
  this.queryQueue = [];
  this.password = config.password || defaults.password;
  this.encoding = 'utf8';
};

sys.inherits(Client, EventEmitter);

var p = Client.prototype;

p.connect = function() {
  var self = this;
  var con = this.connection;
  con.connect(this.port, this.host);

  //once connection is established send startup message
  con.on('connect', function() {
    con.startup({
      user: self.user,
      database: self.database
    });
  });

  //password request handling
  con.on('authenticationCleartextPassword', function() {
    con.password(self.password);
  });

  //password request handling
  con.on('authenticationMD5Password', function(msg) {
    var inner = Client.md5(self.password + self.user);
    var outer = Client.md5(inner + msg.salt.toString('binary'));
    var md5password = "md5" + outer;
    con.password(md5password);
  });

  con.on('readyForQuery', function() {
    self.readyForQuery = true;
    this.activeQuery = null;
    self.pulseQueryQueue();
  });

  con.on('error', function(error) {
    if(!self.activeQuery) {
      self.emit('error', error);
    }
  });
};

p.pulseQueryQueue = function() {
  if(this.readyForQuery===true) {
    if(this.queryQueue.length > 0) {
      this.readyForQuery = false;
      var query = this.queryQueue.shift();
      this.activeQuery = query;
      this.hasExecuted = true;
      query.submit(this.connection);
    } else if(this.hasExecuted) {
      this.activeQuery = null;
      this.emit('drain')
    }
  }
};

p.query = function(config, values, callback) {
  //can take in strings or config objects
  config = (config.text || config.name) ? config : { text: config };
  if(values) {
    if(typeof values === 'function') {
      callback = values;
    }
    else {
      config.values = values;
    }
  }
  if(callback) {
    config.callback = callback;
  }

  var query = new Query(config);
  this.queryQueue.push(query);
  this.pulseQueryQueue();
  return query;
};

p.end = function() {
  this.connection.end();
};

Client.md5 = function(string) {
  return crypto.createHash('md5').update(string).digest('hex');
};

module.exports = Client;

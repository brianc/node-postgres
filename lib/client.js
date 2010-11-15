var sys = require('sys');
var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var Query = require(__dirname + '/query');
var utils = require(__dirname + '/utils');

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
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
  this.host = config.host;
  this.queryQueue = [];
  this.connection = config.connection || new Connection({stream: config.stream || new net.Stream()});
  this.queryQueue = [];
  this.password = config.password || '';

  //internal references only declared here for clarity
  this.lastBuffer = false;
  this.lastOffset = 0;
  this.buffer = null;
  this.offset = null;
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
      query.submit(this.connection);
    } else {
      this.emit('drain');
    }
  }
};

p.query = function(config, callback) {
  //can take in strings or config objects
  config = (config.text || config.name) ? config : { text: config };
  config.callback = config.callback || callback;
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

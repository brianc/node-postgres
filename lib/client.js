var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var Query = require(__dirname + '/query');
var utils = require(__dirname + '/utils');
var defaults = require(__dirname + '/defaults');
var Connection = require(__dirname + '/connection');

var Client = function(config) {
  EventEmitter.call(this);
  if(typeof config === 'string') {
    config = utils.normalizeConnectionInfo(config)
  }
  config = config || {};
  this.user = config.user || defaults.user;
  this.database = config.database || defaults.database;
  this.port = config.port || defaults.port;
  this.host = config.host || defaults.host;
  this.connection = config.connection || new Connection({stream: config.stream});
  this.queryQueue = [];
  this.password = config.password || defaults.password;
  this.binary = config.binary || defaults.binary;
  this.encoding = 'utf8';
  this.processID = null;
  this.secretKey = null;
  var self = this;
};

util.inherits(Client, EventEmitter);

var p = Client.prototype;

p.connect = function(callback) {
  var self = this;
  var con = this.connection;
  if(this.host && this.host.indexOf('/') === 0) {
    con.connect(this.host + '/.s.PGSQL.' + this.port);
  } else {
    con.connect(this.port, this.host);
  }


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

  con.once('backendKeyData', function(msg) {
    self.processID = msg.processID;
    self.secretKey = msg.secretKey;
  });

  //hook up query handling events to connection
  //after the connection initially becomes ready for queries
  con.once('readyForQuery', function() {
    //delegate row descript to active query
    con.on('rowDescription', function(msg) {
      self.activeQuery.handleRowDescription(msg);
    });
    //delegate datarow to active query
    con.on('dataRow', function(msg) {
      self.activeQuery.handleDataRow(msg);
    });
    //TODO should query gain access to connection?
    con.on('portalSuspended', function(msg) {
      self.activeQuery.getRows(con);
    });

    con.on('commandComplete', function(msg) {
      //delegate command complete to query
      self.activeQuery.handleCommandComplete(msg);
      //need to sync after each command complete of a prepared statement
      if(self.activeQuery.isPreparedStatement) {
        con.sync();
      }
    });

    if (!callback) {
      self.emit('connect');
    } else {
      callback(null,self);
      //remove callback for proper error handling after the connect event
      callback = null;
    }

    con.on('notification', function(msg) {
      self.emit('notification', msg);
    });

  });

  con.on('readyForQuery', function() {
    if(self.activeQuery) {
      self.activeQuery.handleReadyForQuery();
    }
    self.activeQuery = null;
    self.readyForQuery = true;
    self._pulseQueryQueue();
  });

  con.on('error', function(error) {
    if(!self.activeQuery) {
      if(!callback) {
        self.emit('error', error);
      } else {
        callback(error);
      }
    } else {
      //need to sync after error during a prepared statement
      if(self.activeQuery.isPreparedStatement) {
        con.sync();
      }
      self.activeQuery.handleError(error);
      self.activeQuery = null;
    }
  });

  con.on('notice', function(msg) {
    self.emit('notice', msg);
  });

};

p.cancel = function(client, query) {
  if (client.activeQuery == query) {
    var con = this.connection;

    if(this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port);
    } else {
      con.connect(this.port, this.host);
    }

    //once connection is established send cancel message
    con.on('connect', function() {
      con.cancel(client.processID, client.secretKey);
    });
  }
  else if (client.queryQueue.indexOf(query) != -1)
    client.queryQueue.splice(client.queryQueue.indexOf(query), 1);
};

p._pulseQueryQueue = function() {
  if(this.readyForQuery===true) {
    this.activeQuery = this.queryQueue.shift();
    if(this.activeQuery) {
      this.readyForQuery = false;
      this.hasExecuted = true;
      this.activeQuery.submit(this.connection);
    } else if(this.hasExecuted) {
      this.activeQuery = null;
      this._drainPaused > 0 ? this._drainPaused++ : this.emit('drain')
    }
  }
};

p.query = function(config, values, callback) {
  //can take in strings or config objects
  config = (typeof(config) == 'string') ? { text: config } : config;
  if (this.binary && !('binary' in config)) {
    config.binary = true;
  }

  if(values) {
    if(typeof values === 'function') {
      callback = values;
    } else {
      config.values = values;
    }
  }

  config.callback = callback;

  var query = new Query(config);
  this.queryQueue.push(query);
  this._pulseQueryQueue();
  return query;
};

//prevents client from otherwise emitting 'drain' event until 'resumeDrain' is called
p.pauseDrain = function() {
  this._drainPaused = 1;
};

//resume raising 'drain' event
p.resumeDrain = function() {
  if(this._drainPaused > 1) {
    this.emit('drain');
  }
  this._drainPaused = 0;
};

p.end = function() {
  this.connection.end();
};

Client.md5 = function(string) {
  return crypto.createHash('md5').update(string).digest('hex');
};

module.exports = Client;

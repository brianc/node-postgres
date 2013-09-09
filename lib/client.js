var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var ConnectionParameters = require(__dirname + '/connection-parameters');
var Query = require(__dirname + '/query');
var defaults = require(__dirname + '/defaults');
var Connection = require(__dirname + '/connection');
var CopyFromStream = require(__dirname + '/copystream').CopyFromStream;
var CopyToStream = require(__dirname + '/copystream').CopyToStream;

var Client = function(config) {
  EventEmitter.call(this);

  this.connectionParameters = new ConnectionParameters(config);
  this.user = this.connectionParameters.user;
  this.database = this.connectionParameters.database;
  this.port = this.connectionParameters.port;
  this.host = this.connectionParameters.host;
  this.password = this.connectionParameters.password;

  var c = config || {};

  this.connection = c.connection || new Connection({
    stream: c.stream,
    ssl: this.connectionParameters.ssl
  });
  this.queryQueue = [];
  this.binary = c.binary || defaults.binary;
  this.encoding = 'utf8';
  this.processID = null;
  this.secretKey = null;
  this.ssl = this.connectionParameters.ssl || false;
};

util.inherits(Client, EventEmitter);

Client.prototype.connect = function(callback) {
  var self = this;
  var con = this.connection;
  if(this.host && this.host.indexOf('/') === 0) {
    con.connect(this.host + '/.s.PGSQL.' + this.port);
  } else {
    con.connect(this.port, this.host);
  }


  //once connection is established send startup message
  con.on('connect', function() {
    if(self.ssl) {
      con.requestSsl();
    } else {
      con.startup({
        user: self.user,
        database: self.database
      });
    }
  });

  con.on('sslconnect', function() {
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

    con.on('copyInResponse', function(msg) {
      self.activeQuery.streamData(self.connection);
    });

    con.on('copyOutResponse', function(msg) {
      if(self.activeQuery.stream  === undefined) {
        self.activeQuery._canceledDueToError =
          new Error('No destination stream defined');
        //canceling query requires creation of new connection
        //look for postgres frontend/backend protocol
        (new self.constructor({port: self.port, host: self.host}))
          .cancel(self, self.activeQuery);
      }
    });

    con.on('copyData', function (msg) {
      self.activeQuery.handleCopyFromChunk(msg.chunk);
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
    var error;
    if(self.activeQuery) {
      //try/catch/rethrow to ensure exceptions don't prevent the queryQueue from
      //being processed
      try{
        self.activeQuery.handleReadyForQuery();
      } catch(e) {
        error = e;
      }
    }
    self.activeQuery = null;
    self.readyForQuery = true;
    self._pulseQueryQueue();
    if(error) {
      throw error;
    }
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
      var activeQuery = self.activeQuery;
      self.activeQuery = null;
      activeQuery.handleError(error);
    }
  });

  con.once('end', function() {
    if(self.activeQuery) {
      self.activeQuery.handleError(new Error('Stream unexpectedly ended during query execution'));
      self.activeQuery = null;
    }
    self.emit('end');
  });


  con.on('notice', function(msg) {
    self.emit('notice', msg);
  });

};

Client.prototype.cancel = function(client, query) {
  if(client.activeQuery == query) {
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
  } else if(client.queryQueue.indexOf(query) != -1) {
    client.queryQueue.splice(client.queryQueue.indexOf(query), 1);
  }
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
Client.prototype.escapeIdentifier = function(str) {

  var escaped = '"';

  for(var i = 0; i < str.length; i++) {
    var c = str[i];
    if(c === '"') {
      escaped += c + c;
    } else {
      escaped += c;
    }
  }

  escaped += '"';

  return escaped;
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
Client.prototype.escapeLiteral = function(str) {

  var hasBackslash = false;
  var escaped = '\'';

  for(var i = 0; i < str.length; i++) {
    var c = str[i];
    if(c === '\'') {
      escaped += c + c;
    } else if (c === '\\') {
      escaped += c + c;
      hasBackslash = true;
    } else {
      escaped += c;
    }
  }

  escaped += '\'';

  if(hasBackslash === true) {
    escaped = ' E' + escaped;
  }

  return escaped;
};

Client.prototype._pulseQueryQueue = function() {
  if(this.readyForQuery===true) {
    this.activeQuery = this.queryQueue.shift();
    if(this.activeQuery) {
      this.readyForQuery = false;
      this.hasExecuted = true;
      this.activeQuery.submit(this.connection);
    } else if(this.hasExecuted) {
      this.activeQuery = null;
      this.emit('drain');
    }
  }
};

Client.prototype._copy = function (text, stream) {
  var config = {};
  config.text = text;
  config.stream = stream;
  config.callback = function (error) {
    if(error) {
      config.stream.error(error);
    } else {
      config.stream.close();
    }
  };
  var query = new Query(config);
  this.queryQueue.push(query);
  this._pulseQueryQueue();
  return config.stream;

};

Client.prototype.copyFrom = function (text) {
  return this._copy(text, new CopyFromStream());
};

Client.prototype.copyTo = function (text) {
  return this._copy(text, new CopyToStream());
};

Client.prototype.query = function(config, values, callback) {
  //can take in strings, config object or query object
  var query = (config instanceof Query) ? config :
     new Query(config, values, callback);
  if(this.binary && !query.binary) {
    query.binary = true;
  }

  this.queryQueue.push(query);
  this._pulseQueryQueue();
  return query;
};

Client.prototype.end = function() {
  this.connection.end();
};

Client.md5 = function(string) {
  return crypto.createHash('md5').update(string).digest('hex');
};

// expose a Query constructor
Client.Query = Query;

module.exports = Client;

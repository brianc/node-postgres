/**
 * Copyright (c) 2010-2016 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var pgPass = require('pgpass');
var TypeOverrides = require('./type-overrides');

var ConnectionParameters = require('./connection-parameters');
var Query = require('./query');
var defaults = require('./defaults');
var Connection = require('./connection');

var Client = function(config) {
  EventEmitter.call(this);

  this.connectionParameters = new ConnectionParameters(config);
  this.user = this.connectionParameters.user;
  this.database = this.connectionParameters.database;
  this.port = this.connectionParameters.port;
  this.host = this.connectionParameters.host;
  this.password = this.connectionParameters.password;

  var c = config || {};

  this._types = new TypeOverrides(c.types);

  this.connection = c.connection || new Connection({
    stream: c.stream,
    ssl: this.connectionParameters.ssl,
    keepAlive: c.keepAlive || false
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
      con.startup(self.getStartupConf());
    }
  });

  con.on('sslconnect', function() {
    con.startup(self.getStartupConf());
  });

  function checkPgPass(cb) {
    return function(msg) {
      if (null !== self.password) {
        cb(msg);
      } else {
        pgPass(self.connectionParameters, function(pass){
          if (undefined !== pass) {
            self.connectionParameters.password = self.password = pass;
          }
          cb(msg);
        });
      }
    };
  }

  //password request handling
  con.on('authenticationCleartextPassword', checkPgPass(function() {
    con.password(self.password);
  }));

  //password request handling
  con.on('authenticationMD5Password', checkPgPass(function(msg) {
    var inner = Client.md5(self.password + self.user);
    var outer = Client.md5(Buffer.concat([new Buffer(inner), msg.salt]));
    var md5password = "md5" + outer;
    con.password(md5password);
  }));

  con.once('backendKeyData', function(msg) {
    self.processID = msg.processID;
    self.secretKey = msg.secretKey;
  });

  //hook up query handling events to connection
  //after the connection initially becomes ready for queries
  con.once('readyForQuery', function() {

    //delegate rowDescription to active query
    con.on('rowDescription', function(msg) {
      self.activeQuery.handleRowDescription(msg);
    });

    //delegate dataRow to active query
    con.on('dataRow', function(msg) {
      self.activeQuery.handleDataRow(msg);
    });

    //delegate portalSuspended to active query
    con.on('portalSuspended', function(msg) {
      self.activeQuery.handlePortalSuspended(con);
    });

    //deletagate emptyQuery to active query
    con.on('emptyQuery', function(msg) {
      self.activeQuery.handleEmptyQuery(con);
    });

    //delegate commandComplete to active query
    con.on('commandComplete', function(msg) {
      self.activeQuery.handleCommandComplete(msg, con);
    });

    //if a prepared statement has a name and properly parses
    //we track that its already been executed so we don't parse
    //it again on the same client
    con.on('parseComplete', function(msg) {
      if(self.activeQuery.name) {
        con.parsedStatements[self.activeQuery.name] = true;
      }
    });

    con.on('copyInResponse', function(msg) {
      self.activeQuery.handleCopyInResponse(self.connection);
    });

    con.on('copyData', function (msg) {
      self.activeQuery.handleCopyData(msg, self.connection);
    });

    con.on('notification', function(msg) {
      self.emit('notification', msg);
    });

    //process possible callback argument to Client#connect
    if (callback) {
      callback(null, self);
      //remove callback for proper error handling
      //after the connect event
      callback = null;
    }
    self.emit('connect');
  });

  con.on('readyForQuery', function() {
    var activeQuery = self.activeQuery;
    self.activeQuery = null;
    self.readyForQuery = true;
    self._pulseQueryQueue();
    if(activeQuery) {
      activeQuery.handleReadyForQuery(con);
    }
  });

  con.on('error', function(error) {
    if(self.activeQuery) {
      var activeQuery = self.activeQuery;
      self.activeQuery = null;
      return activeQuery.handleError(error, con);
    }
    if(!callback) {
      return self.emit('error', error);
    }
    callback(error);
    callback = null;
  });

  con.once('end', function() {
    if ( callback ) {
      // haven't received a connection message yet !
      var err = new Error('Connection terminated');
      callback(err);
      callback = null;
      return;
    }
    if(self.activeQuery) {
      var disconnectError = new Error('Connection terminated');
      self.activeQuery.handleError(disconnectError, con);
      self.activeQuery = null;
    }
    self.emit('end');
  });


  con.on('notice', function(msg) {
    self.emit('notice', msg);
  });

};

Client.prototype.getStartupConf = function() {
  var params = this.connectionParameters;

  var data = {
    user: params.user,
    database: params.database
  };

  var appName = params.application_name || params.fallback_application_name;
  if (appName) {
    data.application_name = appName;
  }

  return data;
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

Client.prototype.setTypeParser = function(oid, format, parseFn) {
  return this._types.setTypeParser(oid, format, parseFn);
};

Client.prototype.getTypeParser = function(oid, format) {
  return this._types.getTypeParser(oid, format);
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

Client.prototype.copyFrom = function (text) {
  throw new Error("For PostgreSQL COPY TO/COPY FROM support npm install pg-copy-streams");
};

Client.prototype.copyTo = function (text) {
  throw new Error("For PostgreSQL COPY TO/COPY FROM support npm install pg-copy-streams");
};

Client.prototype.query = function(config, values, callback) {
  //can take in strings, config object or query object
  var query = (typeof config.submit == 'function') ? config :
     new Query(config, values, callback);
  if(this.binary && !query.binary) {
    query.binary = true;
  }
  if(query._result) {
    query._result._getTypeParser = this._types.getTypeParser.bind(this._types);
  }

  this.queryQueue.push(query);
  this._pulseQueryQueue();
  return query;
};

Client.prototype.end = function(cb) {
  this.connection.end();
  if (cb) {
    this.connection.once('end', cb);
  }
};

Client.md5 = function(string) {
  return crypto.createHash('md5').update(string, 'utf-8').digest('hex');
};

// expose a Query constructor
Client.Query = Query;

module.exports = Client;

//require the c++ bindings & export to javascript
var EventEmitter = require('events').EventEmitter;

var ConnectionParameters = require(__dirname + '/../connection-parameters');
var CopyFromStream = require(__dirname + '/../copystream').CopyFromStream;
var CopyToStream = require(__dirname + '/../copystream').CopyToStream;
var JsClient = require(__dirname + '/../client'); // used to import JS escape functions

var binding;

//TODO remove on v1.0.0
try {
  //v0.5.x
  binding = require(__dirname + '/../../build/Release/binding.node');
} catch(e) {
  //v0.4.x
  binding = require(__dirname + '/../../build/default/binding');
}

var Connection = binding.Connection;
var NativeQuery = require(__dirname + '/query');

for(var k in EventEmitter.prototype) {
  Connection.prototype[k] = EventEmitter.prototype[k];
}

var nativeConnect = Connection.prototype.connect;

Connection.prototype.connect = function(cb) {
  var self = this;
  this.connectionParameters.getLibpqConnectionString(function(err, conString) {
    if(err) {
      return cb ? cb(err) : self.emit('error', err);
    }
    if(cb) {
      var errCallback;
      var connectCallback = function() {
        //remove single-fire connection error callback
        self.removeListener('error', errCallback);
        cb(null);
      };
      errCallback = function(err) {
        //remove singel-fire connection success callback
        self.removeListener('connect', connectCallback);
        cb(err);
      };
      self.once('connect', connectCallback);
      self.once('error', errCallback);
    }
    nativeConnect.call(self, conString);
  });
};

Connection.prototype._copy = function (text, stream) {
  var q = new NativeQuery(text, function (error) {
    if (error) {
      q.stream.error(error);
    } else {
      q.stream.close();
    }
  });
  q.stream = stream;
  this._queryQueue.push(q);
  this._pulseQueryQueue();
  return q.stream;
};

Connection.prototype.copyFrom = function (text) {
  return this._copy(text, new CopyFromStream());
};

Connection.prototype.copyTo = function (text) {
  return this._copy(text, new CopyToStream());
};

Connection.prototype.sendCopyFromChunk = function (chunk) {
  this._sendCopyFromChunk(chunk);
};

Connection.prototype.endCopyFrom = function (msg) {
  this._endCopyFrom(msg);
};

// use JS version if native version undefined
// happens when PG version < 9.0.0
if (!Connection.prototype.escapeIdentifier) {
  Connection.prototype.escapeIdentifier = JsClient.prototype.escapeIdentifier;
}
if (!Connection.prototype.escapeLiteral) {
  Connection.prototype.escapeLiteral = JsClient.prototype.escapeLiteral;
}

Connection.prototype.query = function(config, values, callback) {
  var query = (config instanceof NativeQuery) ? config :
      new NativeQuery(config, values, callback);
  this._queryQueue.push(query);
  this._pulseQueryQueue();
  return query;
};

var nativeCancel = Connection.prototype.cancel;

Connection.prototype.cancel = function(client, query) {
	if (client._activeQuery == query) {
		this.connect(nativeCancel.bind(client));
  } else if (client._queryQueue.indexOf(query) != -1) {
		client._queryQueue.splice(client._queryQueue.indexOf(query), 1);
  }
};

Connection.prototype._pulseQueryQueue = function(initialConnection) {
  if(!this._connected) {
    return;
  }
  if(this._activeQuery) {
    return;
  }
  var query = this._queryQueue.shift();
  if(!query) {
    if(!initialConnection) {
      this.emit('drain');
    }
    return;
  }
  this._activeQuery = query;
  if(query.name) {
    if(this._namedQueries[query.name]) {
      this._sendQueryPrepared(query.name, query.values||[], query.singleRowMode);
    } else {
      this._namedQuery = true;
      this._namedQueries[query.name] = true;
      this._sendPrepare(query.name, query.text, (query.values||[]).length, query.singleRowMode);
    }
  } else if(query.values) {
    //call native function
    this._sendQueryWithParams(query.text, query.values, query.singleRowMode);
  } else {
    //call native function
    this._sendQuery(query.text, query.singleRowMode);
  }
};

Connection.prototype.sendCopyFail = function(msg) {
  this.endCopyFrom(msg);
};

var clientBuilder = function(config) {
  config = config || {};
  var connection = new Connection();
  EventEmitter.call(connection);
  connection._queryQueue = [];
  connection._namedQueries = {};
  connection._activeQuery = null;
  connection.connectionParameters = new ConnectionParameters(config);
  //attach properties to normalize interface with pure js client
  connection.user = connection.connectionParameters.user;
  connection.password = connection.connectionParameters.password;
  connection.database = connection.connectionParameters.database;
  connection.host = connection.connectionParameters.host;
  connection.port = connection.connectionParameters.port;
  connection.on('connect', function() {
    connection._connected = true;
    connection._pulseQueryQueue(true);
  });

  connection.on('_rowDescription', function(rowDescription) {
    connection._activeQuery.handleRowDescription(rowDescription);
  });

  //proxy some events to active query
  connection.on('_row', function(row) {
    connection._activeQuery.handleRow(row);
  });

  connection.on('_cmdStatus', function(status) {
    //set this here so we can pass it to the query
    //when the query completes
    connection._lastMeta = status;
  });

  //TODO: emit more native error properties (make it match js error)
  connection.on('_error', function(err) {
    //create Error object from object literal
    var error = new Error(err.message || "Unknown native driver error");
    for(var key in err) {
      error[key] = err[key];
    }

    //give up on trying to wait for named query prepare
    this._namedQuery = false;
    if(connection._activeQuery) {
      connection._activeQuery.handleError(error);
    } else {
      connection.emit('error', error);
    }
  });

  connection.on('_end', function() {
    process.nextTick(function() {
      if(connection._activeQuery) {
        connection._activeQuery.handleError(new Error("Connection was ended during query"));
      }
      connection.emit('end');
    });
  });

  connection.on('_readyForQuery', function() {
    var error;
    var q = this._activeQuery;
    //a named query finished being prepared
    if(this._namedQuery) {
      this._namedQuery = false;
      this._sendQueryPrepared(q.name, q.values||[]);
    } else {
      //try/catch/rethrow to ensure exceptions don't prevent the queryQueue from
      //being processed
      try{
        connection._activeQuery.handleReadyForQuery(connection._lastMeta);
      } catch(e) {
        error = e;
      }
      connection._activeQuery = null;
      connection._pulseQueryQueue();
      if(error) throw error;
    }
  });
  connection.on('copyInResponse', function () {
    //connection is ready to accept chunks
    //start to send data from stream
    connection._activeQuery.streamData(connection);
  });
  connection.on('copyOutResponse', function(msg) {
    if (connection._activeQuery.stream === undefined) {
      connection._activeQuery._canceledDueToError = new Error('No destination stream defined');
      (new clientBuilder({port: connection.port, host: connection.host})).cancel(connection, connection._activeQuery);
    }
  });
  connection.on('copyData', function (chunk) {
    //recieve chunk from connection
    //move it to stream
    connection._activeQuery.handleCopyFromChunk(chunk);
  });
  return connection;
};

// expose a Query constructor
clientBuilder.Query = NativeQuery;

module.exports = clientBuilder;

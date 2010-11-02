var sys = require('sys');
var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;

var utils = require(__dirname + '/utils');

var Connection = require(__dirname + '/connection');

var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
  this.host = config.host;
  this.queryQueue = [];

  this.connection = config.connection || new Connection({stream: config.stream || new net.Stream()});
  this.queryQueue = [];
  this.password = config.password || '';
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

    self.pulseQueryQueue();
  });

  con.on('error', function(error) {
    self.emit('error', error);
  });
};


p.pulseQueryQueue = function() {
  if(this.readyForQuery===true) {
    if(this.queryQueue.length > 0) {
      this.readyForQuery = false;
      var query = this.queryQueue.shift();
      query.submit(this.connection);
    } else {
      this.emit('drain');
    }
  }
};

p.query = function(config) {
  //can take in strings or config objects
  var query = new Query((config.text || config.name) ? config : { text: config });
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

var Query = function(config) {
  this.text = config.text;
  this.values = config.values;
  this.rows = config.rows;
  this.types = config.types;
  this.name = config.name;
  //for code clarity purposes we'll declare this here though it's not
  //set or used until a rowDescription message comes in
  this.rowDescription = null;
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);
var p = Query.prototype;

p.requiresPreparation = function() {
  return (this.values || 0).length > 0 || this.name || this.rows;
};

p.submit = function(connection) {
  var self = this;
  if(this.requiresPreparation()) {
    this.prepare(connection);
  } else {
    connection.query(this.text);
  }
  var handleRowDescription = function(msg) {
    self.onRowDescription(msg);
  };
  var handleDatarow = function(msg) {
    self.onDataRow(msg);
  };
  connection.on('rowDescription', handleRowDescription);
  connection.on('dataRow', handleDatarow);
  connection.once('readyForQuery', function() {
    //remove all listeners
    connection.removeListener('rowDescription', handleRowDescription);
    connection.removeListener('dataRow', handleDatarow);
    self.emit('end');
  });
};

p.hasBeenParsed = function(connection) {
  return this.name && connection.parsedStatements[this.name];
};

p.prepare = function(connection) {
  var self = this;

  var onParseComplete = function() {
    connection.bind({
      portal: self.name,
      statement: self.name,
      values: self.values
    });
    connection.flush();
  };


  if(this.hasBeenParsed(connection)) {
    onParseComplete();
  } else {
    connection.parsedStatements[this.name] = true;
    connection.parse({
      text: self.text,
      name: self.name,
      types: self.types
    });
    connection.flush();
    connection.once('parseComplete', onParseComplete);
  }


  var onBindComplete = function() {
    connection.describe({
      type: 'P',
      name: self.name || ""
    });
    //http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
    //TODO get ourselves a rowDescription for result type coercion
    connection.execute({
      portal: self.name,
      rows: self.rows
    });
    connection.flush();
  };

  connection.once('bindComplete', onBindComplete);

  //TODO support EmptyQueryResponse, ErrorResponse, and PortalSuspended
  var onCommandComplete =  function() {
    connection.sync();
  };
  connection.once('commandComplete', onCommandComplete);

};


p.onRowDescription = function(msg) {
  var typeIds = msg.fields.map(function(field) {
    return field.dataTypeID;
  });
  var noParse = function(val) {
    return val;
  };

  this.converters = typeIds.map(function(typeId) {
    return Client.dataTypeParser[typeId] || noParse;
  });
};

//handles the raw 'dataRow' event from the connection does type coercion
p.onDataRow = function(msg) {
  var fields = msg.fields;
  var converters = this.converters || [];
  var len = msg.fields.length;
  for(var i = 0; i < len; i++) {
    if(fields[i] !== null) {
      fields[i] = this.converters[i] (fields[i]);
    }
  }
  msg.fields = fields;
  this.emit('row', msg);
};

var dateParser = function(isoDate) {
  //TODO find some regexp help
  //this method works but it's ooglay
  var split = isoDate.split(' ');
  var dateMatcher = /(\d{4})-(\d{2})-(\d{2})/;

  var date = split[0];
  var time = split[1];
  var match = dateMatcher.exec(date);
  var splitDate = date.split('-');
  var year = match[1];
  var month = parseInt(match[2])-1;
  var day = match[3];

  var splitTime = time.split(':');
  var hour = parseInt(splitTime[0]);
  var min = splitTime[1];
  var end = splitTime[2];
  var seconds = /(\d{2})/.exec(end);
  seconds = (seconds ? seconds[1] : 0);
  var mili = /\.(\d{1,})/.exec(end);
  mili = mili ? mili[1].slice(0,3) : 0;
  var tZone = /([Z|+\-])(\d{2})?(\d{2})?/.exec(end);
  //minutes to adjust for timezone
  var tzAdjust = 0;
  if(tZone) {
    var type = tZone[1];
    switch(type) {
    case 'Z': break;
    case '-':
      tzAdjust = -(((parseInt(tZone[2])*60)+(parseInt(tZone[3]||0))));
      break;
    case '+':
      tzAdjust = (((parseInt(tZone[2])*60)+(parseInt(tZone[3]||0))));
      break;
    default:
      throw new Error("Unidentifed tZone part " + type);
    }
  }
  
  var utcOffset = Date.UTC(year, month, day, hour, min, seconds, mili);
  
  var date = new Date(utcOffset - (tzAdjust * 60* 1000));
  return date;
};

Client.dataTypeParser = {
  20: parseInt,
  21: parseInt,
  23: parseInt,
  26: parseInt,
  1700: parseFloat,
  700: parseFloat,
  701: parseFloat,
  16: function(dbVal) { //boolean
    return dbVal === 't';
  },
  //   1083: timeParser,
  //   1266: timeParser,
  1114: dateParser,
  1184: dateParser
};

//end parsing methods
module.exports = Client;

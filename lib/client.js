var sys = require('sys');
var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;

var utils = require(__dirname + '/utils');
var BufferList = require(__dirname + '/buffer-list');
var Connection = require(__dirname + '/connection');

var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
  this.host = config.host;
  this.queryQueue = [];

  this.stream = config.stream || new net.Stream();
  this.connection = new Connection({stream: this.stream});
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

  con.on('connect', function() {
    con.startupMessage({
      user: self.user,
      database: self.database
    });
  });

  con.on('authenticationCleartextPassword', function() {
    con.passwordMessage(self.password);
  });

  con.on('authenticationMD5Password', function(msg) {
    var inner = Client.md5(self.password + self.user);
    var outer = Client.md5(inner + msg.salt.toString('binary'));
    var md5password = "md5" + outer;
    con.passwordMessage(md5password);
  });
};

Client.md5 = function(string) {
  return crypto.createHash('md5').update(string).digest('hex');
};

var intParser = {
  fromDbValue: parseInt
};

var floatParser = {
  fromDbValue: parseFloat
};

var timeParser = {
  fromDbValue: function(isoTime) {
    var when = new Date();
    var split = isoTime.split(':');
    when.setHours(split[0]);
    when.setMinutes(split[1]);
    when.setSeconds(split[2].split('-') [0]);
    return when;
  }
};

var dateParser = {
  fromDbValue: function(isoDate) {
    return Date.parse(isoDate);
  }
};

Client.dataTypes = {
  20: intParser,
  21: intParser,
  23: intParser,
  26: intParser,
  1700: floatParser,
  700: floatParser,
  701: floatParser,
  1083: timeParser,
  1266: timeParser,
  1114: dateParser,
  1184: dateParser
};

p.processRowDescription = function(description) {
  this.fields = description.fields;
};

p.processDataRow = function(dataRow) {
  var row = dataRow.fields;
  var fields = this.fields || [];
  var field, dataType;
  for(var i = 0, len = row.length; i < len; i++) {
    field = fields[i] || 0
    var dataType = Client.dataTypes[field.dataTypeID];
    if(dataType) {
      row[i] = dataType.fromDbValue(row[i]);
    }
  }
  this.emit('row',row);
};

//end parsing methods
module.exports = Client;

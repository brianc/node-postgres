var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');
var NUL = '\0';

var chars = Buffer('R','utf8');
var UTF8 = {
  R: chars[0]
};


var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
};
sys.inherits(Client, EventEmitter);

Client.prototype.connect = function() {
  var con = net.createConnection(this.port);
  var self = this;
  con.on('connect', function() {

    var data = ['user',self.user,'database', self.database,NUL].join(NUL);
    var dataBuffer = Buffer(data);
    var fullBuffer = Buffer(8 + dataBuffer.length);
    fullBuffer[0] = fullBuffer.length >>> 24;
    fullBuffer[1] = fullBuffer.length >>> 16;
    fullBuffer[2] = fullBuffer.length >>> 8;
    fullBuffer[3] = fullBuffer.length >>> 0;
    fullBuffer[4] = 0;
    fullBuffer[5] = 3;
    fullBuffer[6] = 0;
    fullBuffer[7] = 0;
    fullBuffer.write(data,8);
    console.log(fullBuffer);
    con.write(fullBuffer);
  });
  con.on('data', function(data) {
    console.log('data!');
    console.log(data);
  });
};



var Parser = {
  parse: function(buffer, offset) {
    offset = offset || 0;
    switch(buffer[offset]) {
    case UTF8.R:
      return Parser.parseR(buffer, offset);
    default:
      throw new Error("Unsupported message ID");
    }
  },
  parseR: function(buffer, offset) {
    var type = buffer[offset++];
    var length = ((buffer[offset++] << 24) +
                  (buffer[offset++] << 16) +
                  (buffer[offset++] << 8) +
                  buffer[offset++]);
    if(length == 8) {
      return {
        name: 'AuthenticationOk',
        id: 'R',
        length: length
      }
    }
  }
};


module.exports = {
  Client: Client,
  Parser: Parser
};

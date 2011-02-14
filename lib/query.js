var EventEmitter = require('events').EventEmitter;
var sys = require('sys');var sys = require('sys');
var Result = require(__dirname + "/result");
var TextParser = require(__dirname + "/textParser");
var BinaryParser = require(__dirname + "/binaryParser");

var Query = function(config) {
  this.text = config.text;
  this.values = config.values;
  this.rows = config.rows;
  this.types = config.types;
  this.name = config.name;
  this.binary = config.binary;
  //for code clarity purposes we'll declare this here though it's not
  //set or used until a rowDescription message comes in
  this.rowDescription = null;
  this.callback = config.callback;
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);
var p = Query.prototype;

p.requiresPreparation = function() {
  return (this.values || 0).length > 0 || this.name || this.rows || this.binary;
};


var noParse = function(val) {
  return val;
};

//creates datarow metatdata from the supplied
//data row information
var buildDataRowMetadata = function(msg, converters, names) {
  var parsers = {
    text: new TextParser(),
    binary: new BinaryParser()
  };

  var len = msg.fields.length;
  for(var i = 0; i < len; i++) {
    var field = msg.fields[i];
    var dataTypeId = field.dataTypeID;
    var format = field.format;
    names[i] = field.name;
    switch(dataTypeId) {
    case 20:
      converters[i] = parsers[format].parseInt64;
      break;
    case 21:
      converters[i] = parsers[format].parseInt16;
      break;
    case 23:
      converters[i] = parsers[format].parseInt32;
      break;
    case 26:
      converters[i] = parsers[format].parseInt64;
      break;
    case 700:
      converters[i] = parsers[format].parseFloat32;
      break;
    case 701:
      converters[i] = parsers[format].parseFloat64;
      break;
    case 1700:
      converters[i] = parsers[format].parseNumeric;
      break;
    case 16:
      converters[i] = parsers[format].parseBool;
      break;
    case 1114:
    case 1184:
      converters[i] = parsers[format].parseDate;
      break;
    case 1008:
    case 1009:
      converters[i] = parsers[format].parseStringArray;
      break;
    case 1007:
      converters[i] = parsers[format].parseIntArray;
      break;
    default:
      converters[i] = dataTypeParsers[dataTypeId] || noParse;
      break;
    }
  };
}

p.submit = function(connection) {
  var self = this;
  if(this.requiresPreparation()) {
    this.prepare(connection);
  } else {
    connection.query(this.text);
  }

  var converters = [];
  var names = [];
  var handleRowDescription = function(msg) {
    buildDataRowMetadata(msg, converters, names);
  };

  var result = new Result();

  var handleDatarow = function(msg) {
    var row = {};
    for(var i = 0; i < msg.fields.length; i++) {
      var rawValue = msg.fields[i];
      row[names[i]] = rawValue === null ? null : converters[i](rawValue);
    }
    self.emit('row', row);

    //if there is a callback collect rows
    if(self.callback) {
      result.addRow(row);
    }
  };

  var onCommandComplete = function(msg) {
    result.addCommandComplete(msg);
  };

  var onError = function(err) {
    //remove all listeners
    removeListeners();
    if(self.callback) {
      self.callback(err);
    } else {
      self.emit('error', err);
    }
    self.emit('end');
  };

  var onReadyForQuery = function() {
    removeListeners();
    if(self.callback) {
      self.callback(null, result);
    }
    self.emit('end', result);
  };

  var removeListeners = function() {
    //remove all listeners
    connection.removeListener('rowDescription', handleRowDescription);
    connection.removeListener('dataRow', handleDatarow);
    connection.removeListener('readyForQuery', onReadyForQuery);
    connection.removeListener('commandComplete', onCommandComplete);
    connection.removeListener('error', onError);
  };

  connection.on('rowDescription', handleRowDescription);
  connection.on('dataRow', handleDatarow);
  connection.on('readyForQuery', onReadyForQuery);
  connection.on('commandComplete', onCommandComplete);
  connection.on('error', onError);
};

p.hasBeenParsed = function(connection) {
  return this.name && connection.parsedStatements[this.name];
};

p.prepare = function(connection) {
  var self = this;

  if(!this.hasBeenParsed(connection)) {
    connection.parse({
      text: self.text,
      name: self.name,
      types: self.types
    });
    connection.parsedStatements[this.name] = true;
  }

  //TODO is there some btter way to prepare values for the database?
  if(self.values) {
    self.values = self.values.map(function(val) {
      return (val instanceof Date) ? JSON.stringify(val) : val;
    });
  }

  //http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
  connection.bind({
    portal: self.name,
    statement: self.name,
    values: self.values,
    binary: self.binary
  });

  connection.describe({
    type: 'P',
    name: self.name || ""
  });

  var getRows = function() {
    connection.execute({
      portal: self.name,
      rows: self.rows
    });
    connection.flush();
  };

  getRows();

  var onCommandComplete =  function() {
    connection.removeListener('error', onCommandComplete);
    connection.removeListener('commandComplete', onCommandComplete);
    connection.removeListener('portalSuspended', getRows);
    connection.sync();
  };

  connection.on('portalSuspended', getRows);

  connection.on('commandComplete', onCommandComplete);
  connection.on('error', onCommandComplete);
};

var dataTypeParsers = {
};

module.exports = Query;

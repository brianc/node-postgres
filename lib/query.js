var EventEmitter = require('events').EventEmitter;
var sys = require('sys');var sys = require('sys');
var Result = require(__dirname + "/result");

var Query = function(config) {
  this.text = config.text;
  this.values = config.values;
  this.rows = config.rows;
  this.types = config.types;
  this.name = config.name;
  //for code clarity purposes we'll declare this here though it's not
  //set or used until a rowDescription message comes in
  this.rowDescription = null;
  this.callback = config.callback;
  this._fieldNames = [];
  this._fieldConverters = [];
  this._result = new Result();
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);
var p = Query.prototype;

p.requiresPreparation = function() {
  return (this.values || 0).length > 0 || this.name || this.rows;
};


var noParse = function(val) {
  return val;
};

//associates row metadata from the supplied
//message with this query object
//metadata used when parsing row results
p.handleRowDescription = function(msg) {
  this._fieldNames = [];
  this._fieldConverters = [];
  var len = msg.fields.length;
  for(var i = 0; i < len; i++) {
    var field = msg.fields[i];
    var dataTypeId = field.dataTypeID;
    this._fieldNames[i] = field.name;
    switch(dataTypeId) {
    case 20:
    case 21:
    case 23:
    case 26:
      this._fieldConverters[i] = parseInt;
      break;
    case 1700:
    case 700:
    case 701:
      this._fieldConverters[i] = parseFloat;
      break;
    case 16:
      this._fieldConverters[i] = function(val) {
        return val === 't';
      };
      break;
    case 1114:
    case 1184:
      this._fieldConverters[i] = dateParser;
      break;
    default:
      this._fieldConverters[i] = dataTypeParsers[dataTypeId] || noParse;
      break;
    }
  };
};

p.handleDataRow = function(msg) {
  var self = this;
  var row = {};
  for(var i = 0; i < msg.fields.length; i++) {
    var rawValue = msg.fields[i];
    if(rawValue === null) {
      //leave null values alone
      row[self._fieldNames[i]] = null;
    } else {
      //convert value to javascript
      row[self._fieldNames[i]] = self._fieldConverters[i](rawValue);
    }
  }
  self.emit('row', row);

  //if there is a callback collect rows
  if(self.callback) {
    self._result.addRow(row);
  }
};

p.handleCommandComplete = function(msg) {
  this._result.addCommandComplete(msg);
};

p.submit = function(connection) {
  var self = this;
  if(this.requiresPreparation()) {
    this.prepare(connection);
  } else {
    connection.query(this.text);
  }

  var onReadyForQuery = function() {
    removeListeners();
    if(self.callback) {
      self.callback(null, self._result);
    }
    self.emit('end', self._result);
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

  var onDataRow = this.handleDataRow.bind(this);

  var removeListeners = function() {
    //remove all listeners
    connection.removeListener('readyForQuery', onReadyForQuery);
    connection.removeListener('error', onError);
  };

  connection.on('readyForQuery', onReadyForQuery);
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
    values: self.values
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

var dateParser = function(isoDate) {
  //TODO this could do w/ a refactor

  var dateMatcher = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;

  var match = dateMatcher.exec(isoDate);
  var year = match[1];
  var month = parseInt(match[2],10)-1;
  var day = match[3];
  var hour = parseInt(match[4],10);
  var min = parseInt(match[5],10);
  var seconds = parseInt(match[6], 10);

  var miliString = match[7];
  var mili = 0;
  if(miliString) {
    mili = 1000 * parseFloat(miliString);
  }

  var tZone = /([Z|+\-])(\d{2})?(\d{2})?/.exec(isoDate.split(' ')[1]);
  //minutes to adjust for timezone
  var tzAdjust = 0;

  if(tZone) {
    var type = tZone[1];
    switch(type) {
    case 'Z': break;
    case '-':
      tzAdjust = -(((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
      break;
    case '+':
      tzAdjust = (((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
      break;
    default:
      throw new Error("Unidentifed tZone part " + type);
    }
  }

  var utcOffset = Date.UTC(year, month, day, hour, min, seconds, mili);

  var date = new Date(utcOffset - (tzAdjust * 60* 1000));
  return date;
};

// To help we test dateParser
Query.dateParser = dateParser;

var dataTypeParsers = {
};

//TODO document this public method
Query.registerParser = function(typeOid, parseFunction) {
  dataTypeParsers[typeOid] = parseFunction;
};

//parses integer arrays
Query.registerParser(1007, function(val) {
  return JSON.parse(val.replace("{","[").replace("}","]"));
});

//parses string arrays
//this only works in happy cases
//does not yet support strings with , or { or }
Query.registerParser(1009, function(val) {
  if (!val) return null;
  if (val[0] !== '{' || val[val.length-1] !== '}')
    throw "Not postgresql array! (" + arrStr + ")";

  var x = val.substring(1, val.length - 1);
  x = x.match(/(NULL|[^,]+|"((?:.|\n|\r)*?)(?!\\)"|\{((?:.|\n|\r)*?(?!\\)\}) (,|$))/mg);
  if (x === null) throw "Not postgre array";
  return x.map(function (el) {
    if (el === 'NULL') return null;
    if (el[0] === '{') return arguments.callee(el);
    if (el[0] === '\"')  return el.substring(1, el.length - 1).replace('\\\"', '\"');
    return el;
  });
});

module.exports = Query;

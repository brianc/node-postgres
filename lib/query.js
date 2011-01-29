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

//creates datarow metatdata from the supplied
//data row information
var buildDataRowMetadata = function(msg, converters, names) {
  var len = msg.fields.length;
  for(var i = 0; i < len; i++) {
    var field = msg.fields[i];
    var dataTypeId = field.dataTypeID;
    names[i] = field.name;
    switch(dataTypeId) {
    case 20:
      converters[i] = parseBinaryInt64;
      break;
    case 21:
      converters[i] = parseBinaryInt16;
      break;
    case 23:
      converters[i] = parseBinaryInt32;
      break;
    case 26:
      converters[i] = parseBinaryInt64;
      break;
    case 1700:
    case 700:
      converters[i] = parseBinaryFloat32;
    case 701:
      converters[i] = parseBinaryFloat64;
      break;
    case 16:
      converters[i] = function(val) {
        return val == 1;
      };
      break;
    case 1114:
    case 1184:
      converters[i] = parseDate;
      break;
    case 1007:
    case 1008:
      converters[i] = arrayParser,
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

function shl(a,b) {
    // Copyright (c) 1996 Henri Torgemane. All Rights Reserved.
    // fix for crappy <<
    for (var i=0;i<b;i++) {
        a=a%0x80000000;
        if (a&0x40000000==0x40000000)
        {
            a-=0x40000000;
            a*=2;
            a+=0x80000000;
        } else
            a*=2;
    };

    return a;
}

var parseFloat = function(data, precisionBits, exponentBits) {
    var bias = Math.pow(2, exponentBits - 1) - 1;
    var sign = parseBits(data, 1);
    var exponent = parseBits(data, exponentBits, 1);

    if (exponent == 0)
        return 0;

    // parse mantissa
    var precisionBitsCounter = 1;
    var parsePrecisionBits = function(lastValue, newValue, bits) {
        if (lastValue == 0) {
            lastValue = 1;
        }

        for (var i = 1; i <= bits; i++) {
            precisionBitsCounter /= 2;
            if ((newValue & (0x1 << (bits - i))) > 0) {
                lastValue += precisionBitsCounter;
            }
        }

        return lastValue;
    };

    var mantissa = parseBits(data, precisionBits, exponentBits + 1, parsePrecisionBits);

    // special cases
    if (exponent == (Math.pow(2, exponentBits + 1) - 1)) {
        if (mantissa == 0) {
            return (sign == 0) ? Infinity : -Infinity;
        }

        return NaN;
    }

    // normale number
    return ((sign == 0) ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
};

var parseBits = function(data, bits, offset, callback) {
    offset = offset || 0;
    callback = callback || function(lastValue, newValue, bits) { return (lastValue * Math.pow(2, bits)) + newValue; };
    var offsetBytes = offset >> 3;

    // read first (maybe partial) byte
    var mask = 0xff;
    var firstBits = 8 - (offset % 8);
    if (bits < firstBits) {
        mask = (0xff << (8 - bits)) & 0xff;
        firstBits = bits;
    }

    if (offset) {
        mask = mask >> (offset % 8);
    }
    var result = callback(0, data[offsetBytes] & mask, firstBits);

    // read bytes
    var bytes = (bits + offset) >> 3;
    for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, data[i], 8);
    }

    // bits to read, that are not a complete byte
    var lastBits = (bits + offset) % 8;
    if (lastBits > 0) {
        result = callback(result, data[bytes] >> (8 - lastBits), lastBits);
    }

    return result;
}

var parseBinaryInt64 = function(value) {
    return parseBits(value, 64);
}

var parseBinaryInt32 = function(value) {
    return parseBits(value, 32);
}

var parseBinaryInt16 = function(value) {
    return parseBits(value, 16);
}

var parseBinaryFloat32 = function(value) {
    return parseFloat(value, 23, 8);
}

var parseBinaryFloat64 = function(value) {
    return parseFloat(value, 52, 11);
}

var parseDate = function(value) {
    var sign = parseBits(value, 1);
    var rawValue = parseBits(value, 63, 1);

    // discard usecs and shift from 2000 to 1970
    var result = new Date((((sign == 0) ? 1 : -1) * rawValue / 1000) + 946684800000);

    // add microseconds to the date
    result.usec = rawValue % 1000;
    result.getMicroSeconds = function() {
        return this.usec;
    };
    result.setMicroSeconds = function(value) {
        this.usec = value;
    };
    result.getUTCMicroSeconds = function() {
        return this.usec;
    };

    return result;
}

var arrayParser = function(value) {
    var dim = parseBits(value, 32);

    var flags = parseBits(value, 32, 32);
    var elementType = parseBits(value, 32, 64);

    var offset = 96;
    var dims = new Array();
    for (var i = 0; i < dim; i++) {
        // parse dimension
        dims[i] = parseBits(value, 32, offset);
        offset += 32;

        // ignore lower bounds
        offset += 32;
    };


    var parseElement = function(elementType) {
        // parse content length
        var length = parseBits(value, 32, offset);
        offset += 32;

        // parse null values
        if (length == 0xffffffff) {
            return null;
        }

        if (elementType == 0x17) {
            // int
            var result = parseBits(value, length * 8, offset);
            offset += length * 8;
            return result;
        }
        else if (elementType == 0x19) {
            // string
            var result = value.toString('utf8', offset >> 3, (offset += (length << 3)) >> 3);
            return result;
        }
        else {
            console.log("ERROR: ElementType not implemented: " + elementType);
        }
    };

    var parseArray = function(dimension, elementType) {
        var array = new Array();

        if (dimension.length > 1) {
            var count = dimension.shift();
            for (var i = 0; i < count; i++) {
                array[i] = parseArray(dimension, elementType);
            }
            dimension.unshift(count);
        }
        else {
            for (var i = 0; i < dimension[0]; i++) {
                array[i] = parseElement(elementType);
            }
        }

        return array;
    }

    return parseArray(dims, elementType);
};

// To help we test dateParser
Query.dateParser = dateParser;

var dataTypeParsers = {
};

module.exports = Query;

var arrayParser = require(__dirname + "/arrayParser.js");

//parses PostgreSQL server formatted date strings into javascript date objects
var parseDate = function(isoDate) {
  //TODO this could do w/ a refactor
  var dateMatcher = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;

  var match = dateMatcher.exec(isoDate);
  //could not parse date
  if(!match) {
    dateMatcher = /^(\d{4})-(\d{2})-(\d{2})$/;
    match = dateMatcher.test(isoDate);
    if(!match) {
      return null;
    } else {
      //it is a date in YYYY-MM-DD format
      return new Date(isoDate);
    }
  }
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

var parseBool = function(val) {
  return val === 't';
}

var parseIntegerArray = function(val) {
  if(!val) return null;
  var p = arrayParser.create(val, function(entry){
    if(entry != null)
      entry = parseInt(entry, 10);
    return entry;
  });
  
  return p.parse();
};

var parseFloatArray = function(val) {
  if(!val) return null;
  var p = arrayParser.create(val, function(entry){
    if(entry != null)
      entry = parseFloat(entry, 10);
    return entry;
  });
  
  return p.parse();
};

var parseStringArray = function(val) {
  if(!val) return null;
  
  var p = arrayParser.create(val);
  return p.parse();
};


var NUM = '([+-]?\\d+)';
var YEAR = NUM + '\\s+years?';
var MON = NUM + '\\s+mons?';
var DAY = NUM + '\\s+days?';
var TIME = '([+-])?(\\d\\d):(\\d\\d):(\\d\\d)';
var INTERVAL = [YEAR,MON,DAY,TIME].map(function(p){ return "("+p+")?" }).join('\\s*');

var parseInterval = function(val) {
  if (!val) return {};
  var m = new RegExp(INTERVAL).exec(val);
  var i = {};
  if (m[2]) i.years = parseInt(m[2], 10);
  if (m[4]) i.months = parseInt(m[4], 10);
  if (m[6]) i.days = parseInt(m[6], 10);
  if (m[9]) i.hours = parseInt(m[9], 10);
  if (m[10]) i.minutes = parseInt(m[10], 10);
  if (m[11]) i.seconds = parseInt(m[11], 10);
  if (m[8] == '-'){
      if (i.hours) i.hours *= -1;
      if (i.minutes) i.minutes *= -1;
      if (i.seconds) i.seconds *= -1;
  }
  for (field in i){
      if (i[field] == 0)
	  delete i[field];
  }
  return i;
};

var parseByteA = function(val) {
  if(/^\\x/.test(val)){
    // new 'hex' style response (pg >9.0)
    return new Buffer(val.substr(2), 'hex');
  }else{
    out = ""
    i = 0
    while(i < val.length){
      if(val[i] != "\\"){
        out += val[i]
        ++i
      }else{
        if(val.substr(i+1,3).match(/[0-7]{3}/)){
          out += String.fromCharCode(parseInt(val.substr(i+1,3),8))
          i += 4
        }else{
          backslashes = 1
          while(i+backslashes < val.length && val[i+backslashes] == "\\")
            backslashes++
          for(k=0; k<Math.floor(backslashes/2); ++k)
            out += "\\"
          i += Math.floor(backslashes / 2) * 2
        }
      }
    }
    return new Buffer(out,"binary");
  }
}

var maxLen = Number.MAX_VALUE.toString().length

var parseInteger = function(val) {
  return parseInt(val, 10);
}

var init = function(register) {
    register(20, parseInteger);
    register(21, parseInteger);
    register(23, parseInteger);
    register(26, parseInteger);
    register(1700, function(val){
      if(val.length > maxLen) {
        console.warn('WARNING: value %s is longer than max supported numeric value in javascript. Possible data loss', val)
      }
      return parseFloat(val);
    });
    register(700, parseFloat);
    register(701, parseFloat);
    register(16, parseBool);
    register(1082, parseDate);
    register(1114, parseDate);
    register(1184, parseDate);
    register(1005, parseIntegerArray); // _int2
    register(1007, parseIntegerArray); // _int4
    register(1016, parseIntegerArray); // _int8
    register(1021, parseFloatArray); // _float4
    register(1022, parseFloatArray); // _float8
    register(1231, parseIntegerArray); // _numeric
    register(1008, parseStringArray);
    register(1009, parseStringArray);
    register(1186, parseInterval);
    register(17, parseByteA);
};

module.exports = {
    init: init,
};

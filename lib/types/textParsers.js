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
  var isBC = /BC$/.test(isoDate);
  var _year = parseInt(match[1], 10);
  var isFirstCentury = (_year > 0) && (_year < 100);
  var year = (isBC ? "-" : "") + match[1];

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

  //match timezones like the following:
  //Z (UTC)
  //-05
  //+06:30
  var tZone = /([Z|+\-])(\d{2})?:?(\d{2})?/.exec(isoDate.split(' ')[1]);
  //minutes to adjust for timezone
  var tzAdjust = 0;
  var date;
  if(tZone) {
    var type = tZone[1];
    switch(type) {
    case 'Z':
      break;
    case '-':
      tzAdjust = -(((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
      break;
    case '+':
      tzAdjust = (((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
      break;
    default:
      throw new Error("Unidentifed tZone part " + type);
    }

    var utcOffset = Date.UTC(year, month, day, hour, min, seconds, mili);

    date = new Date(utcOffset - (tzAdjust * 60* 1000));
  }
  //no timezone information
  else {
    date = new Date(year, month, day, hour, min, seconds, mili);
  }

  if (isFirstCentury) {
    date.setUTCFullYear(year);
  }
  return date;
};

var parseBool = function(val) {
  return val === 't';
};

var parseIntegerArray = function(val) {
  if(!val) { return null; }
  var p = arrayParser.create(val, function(entry){
    if(entry !== null) {
      entry = parseInt(entry, 10);
    }
    return entry;
  });

  return p.parse();
};

var parseFloatArray = function(val) {
  if(!val) { return null; }
  var p = arrayParser.create(val, function(entry) {
    return entry;
  });

  return p.parse();
};

var parseStringArray = function(val) {
  if(!val) { return null; }

  var p = arrayParser.create(val);
  return p.parse();
};


var NUM = '([+-]?\\d+)';
var YEAR = NUM + '\\s+years?';
var MON = NUM + '\\s+mons?';
var DAY = NUM + '\\s+days?';
var TIME = '([+-])?(\\d\\d):(\\d\\d):(\\d\\d)';
var INTERVAL = [YEAR,MON,DAY,TIME].map(function(p){
  return "("+p+")?";
}).join('\\s*');

var parseInterval = function(val) {
  if (!val) { return {}; }
  var m = new RegExp(INTERVAL).exec(val);
  var i = {};
  if (m[2]) { i.years = parseInt(m[2], 10); }
  if (m[4]) { i.months = parseInt(m[4], 10); }
  if (m[6]) { i.days = parseInt(m[6], 10); }
  if (m[9]) { i.hours = parseInt(m[9], 10); }
  if (m[10]) { i.minutes = parseInt(m[10], 10); }
  if (m[11]) { i.seconds = parseInt(m[11], 10); }
  if (m[8] == '-'){
    if (i.hours) { i.hours *= -1; }
    if (i.minutes) { i.minutes *= -1; }
    if (i.seconds) { i.seconds *= -1; }
  }
  for (var field in i){
    if (i[field] === 0) {
      delete i[field];
    }
  }
  return i;
};

var parseByteA = function(val) {
  if(/^\\x/.test(val)){
    // new 'hex' style response (pg >9.0)
    return new Buffer(val.substr(2), 'hex');
  }else{
    var out = "";
    var i = 0;
    while(i < val.length){
      if(val[i] != "\\"){
        out += val[i];
        ++i;
      }else{
        if(val.substr(i+1,3).match(/[0-7]{3}/)){
          out += String.fromCharCode(parseInt(val.substr(i+1,3),8));
          i += 4;
        }else{
          backslashes = 1;
          while(i+backslashes < val.length && val[i+backslashes] == "\\")
            backslashes++;
          for(k=0; k<Math.floor(backslashes/2); ++k)
            out += "\\";
          i += Math.floor(backslashes / 2) * 2;
        }
      }
    }
    return new Buffer(out,"binary");
  }
};

var maxLen = Number.MAX_VALUE.toString().length;

var parseInteger = function(val) {
  return parseInt(val, 10);
};

var parseBigInteger = function(val) {
  var valStr = String(val);
  if (/^\d+$/.test(valStr)) { return valStr; }
  return val;
};

var init = function(register) {
  register(20, parseBigInteger); // int8
  register(21, parseInteger); // int2
  register(23, parseInteger); // int4
  register(26, parseInteger); // oid
  register(700, parseFloat); // float4/real
  register(701, parseFloat); // float8/double
  register(16, parseBool);
  register(1082, parseDate); // date
  register(1114, parseDate); // timestamp without timezone
  register(1184, parseDate); // timestamp
  register(1005, parseIntegerArray); // _int2
  register(1007, parseIntegerArray); // _int4
  register(1016, parseIntegerArray); // _int8
  register(1021, parseFloatArray); // _float4
  register(1022, parseFloatArray); // _float8
  register(1231, parseFloatArray); // _numeric
  register(1014, parseStringArray); //char
  register(1015, parseStringArray); //varchar
  register(1008, parseStringArray);
  register(1009, parseStringArray);
  register(1186, parseInterval);
  register(17, parseByteA);
  register(114, JSON.parse.bind(JSON));
};

module.exports = {
  init: init
};

//parses PostgreSQL server formatted date strings into javascript date objects
var parseDate = function(isoDate) {
  //TODO this could do w/ a refactor
  var dateMatcher = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;

  var match = dateMatcher.exec(isoDate);
  //could not parse date
  if(!match) {
    return null;
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
  return JSON.parse(val.replace("{","[").replace("}","]"));
};

var parseStringArray = function(val) {
  if (!val) return null;
  if (val[0] !== '{' || val[val.length-1] !== '}')
    throw "Not postgresql array! (" + arrStr + ")";

  var x = val.substring(1, val.length - 1);
  if (x === '') return [];
  x = x.match(/(NULL|[^,]+|"((?:.|\n|\r)*?)(?!\\)"|\{((?:.|\n|\r)*?(?!\\)\}) (,|$))/mg);
  if (x === null) throw "Not postgre array";
  return x.map(function (el) {
    if (el === 'NULL') return null;
    if (el[0] === '{') return arguments.callee(el);
    if (el[0] === '\"')  return el.substring(1, el.length - 1).replace(/\\(.)/g, '$1');
    return el;
  });
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
  if (m[2]) i.years = parseInt(m[2]);
  if (m[4]) i.months = parseInt(m[4]);
  if (m[6]) i.days = parseInt(m[6]);
  if (m[9]) i.hours = parseInt(m[9]);
  if (m[10]) i.minutes = parseInt(m[10]);
  if (m[11]) i.seconds = parseInt(m[11]);
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
  return new Buffer(val.replace(/\\([0-7]{3})/g, function (full_match, code) {
    return String.fromCharCode(parseInt(code, 8));
  }).replace(/\\\\/g, "\\"), "binary");
}

var init = function(register) {
    register(20, parseInt);
    register(21, parseInt);
    register(23, parseInt);
    register(26, parseInt);
    register(1700, parseFloat);
    register(700, parseFloat);
    register(701, parseFloat);
    register(16, parseBool);
    register(1114, parseDate);
    register(1184, parseDate);
    register(1007, parseIntegerArray);
    register(1016, parseIntegerArray);
    register(1008, parseStringArray);
    register(1009, parseStringArray);
    register(1186, parseInterval);
    register(17, parseByteA);
};

module.exports = {
    init: init,
};

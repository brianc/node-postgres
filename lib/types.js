//maps types from javascript to postgres and vise-versa

var typeParsers = {};
//registers a method used to parse a string representing a particular
//oid type into a javascript type
var registerStringTypeParser = function(oid, converter) {
  typeParsers[oid] = converter;
};

//the empty parse function
var noParse = function(val) {
  return val;
}

//returns a function used to convert a specific type (specified by
//oid) into a result javascript type
var getStringTypeParser = function(oid) {
  return typeParsers[oid] || noParse;
};

//parses PostgreSQL server formatted date strings into javascript date objects
var parseDate = function(isoDate) {
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
  x = x.match(/(NULL|[^,]+|"((?:.|\n|\r)*?)(?!\\)"|\{((?:.|\n|\r)*?(?!\\)\}) (,|$))/mg);
  if (x === null) throw "Not postgre array";
  return x.map(function (el) {
    if (el === 'NULL') return null;
    if (el[0] === '{') return arguments.callee(el);
    if (el[0] === '\"')  return el.substring(1, el.length - 1).replace('\\\"', '\"');
    return el;
  });
};

//default string type parser registrations
registerStringTypeParser(20, parseInt);
registerStringTypeParser(21, parseInt);
registerStringTypeParser(23, parseInt);
registerStringTypeParser(26, parseInt);
registerStringTypeParser(1700, parseFloat);
registerStringTypeParser(700, parseFloat);
registerStringTypeParser(701, parseFloat);
registerStringTypeParser(16, parseBool);
registerStringTypeParser(1114, parseDate);
registerStringTypeParser(1184, parseDate);
registerStringTypeParser(1007, parseIntegerArray);
registerStringTypeParser(1009, parseStringArray);

module.exports = {
  registerStringTypeParser: registerStringTypeParser,
  getStringTypeParser: getStringTypeParser
}

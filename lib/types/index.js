var textParsers = require(__dirname + '/textParsers');
var binaryParsers = require(__dirname + '/binaryParsers');

var typeParsers = {
  text: {},
  binary: {}
};

//the empty parse function
var noParse = function(val) {
  return String(val);
};

//returns a function used to convert a specific type (specified by
//oid) into a result javascript type
//note: the oid can be obtained via the following sql query:
//SELECT oid FROM pg_type WHERE typname = 'TYPE_NAME_HERE';
var getTypeParser = function(oid, format) {
  if (!typeParsers[format]) {
    return noParse;
  }
  return typeParsers[format][oid] || noParse;
};

var setTypeParser = function(oid, format, parseFn) {
  if(typeof format == 'function') {
    parseFn = format;
    format = 'text';
  }
  typeParsers[format][oid] = parseFn;
};

textParsers.init(function(oid, converter) {
  typeParsers.text[oid] = converter;
});

binaryParsers.init(function(oid, converter) {
  typeParsers.binary[oid] = converter;
});

module.exports = {
  getTypeParser: getTypeParser,
  setTypeParser: setTypeParser
};

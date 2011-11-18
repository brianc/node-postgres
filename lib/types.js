var textParsers = require(__dirname + "/textParsers"),
binaryParsers = require(__dirname + "/binaryParsers");

var typeParsers = {
  text: {},
  binary: {}
};

//the empty parse function
var noParse = function(val) {
  return val;
}

//returns a function used to convert a specific type (specified by
//oid) into a result javascript type
var getTypeParser = function(oid, format) {
  if (!typeParsers[format])
    return noParse;

  return typeParsers[format][oid] || noParse;
};

textParsers.init(function(oid, converter) {
  typeParsers.text[oid] = converter;
});

binaryParsers.init(function(oid, converter) {
  typeParsers.binary[oid] = converter;
});

var parseByteA = function(val) {
  return new Buffer(val.replace(/\\([0-7]{3})/g, function (full_match, code) {
    return String.fromCharCode(parseInt(code, 8));
  }).replace(/\\\\/g, "\\"), "binary");
}

module.exports = {
  getTypeParser: getTypeParser,
}

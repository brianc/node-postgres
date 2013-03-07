var os = require('os');
var defaults = require(__dirname + '/defaults');

var hits = {
};
var deprecate = module.exports = function(methodName, message) {
  if(defaults.hideDeprecationWarnings) return;
  if(hits[deprecate.caller]) return;
  hits[deprecate.caller] = true;
  process.stderr.write(os.EOL);
  process.stderr.write('\x1b[31;1m');
  process.stderr.write('WARNING!!');
  process.stderr.write(os.EOL);
  process.stderr.write(methodName);
  process.stderr.write(os.EOL);
  for(var i = 1; i < arguments.length; i++) {
    process.stderr.write(arguments[i]);
    process.stderr.write(os.EOL);
  }
  process.stderr.write('\x1b[0m');
  process.stderr.write(os.EOL);
  process.stderr.write("You can silence these warnings with `require('pg').defaults.hideDeprecationWarnings = true`");
  process.stderr.write(os.EOL);
  process.stderr.write(os.EOL);
};

var requireLib = function(lib) {
  return require(__dirname + '/../../lib/' + lib);
};
Client = requireLib('client');
Connection = requireLib('connection');
sys = require('sys');

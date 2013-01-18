var defaults = require(__dirname + '/defaults');

var val = function(key, config) {
  return config[key] || 
    process.env['PG' + key.toUpperCase()] || 
    defaults[key];
};

var url = require('url');
//parses a connection string
var parse = function(str) {
  //unix socket
  if(str.charAt(0) === '/') {
    return { host: str };
  }
  var result = url.parse(str);
  var config = {};
  config.host = result.hostname;
  config.database = result.pathname ? result.pathname.slice(1) : null
  var auth = (result.auth || ':').split(':');
  config.user = auth[0];
  config.password = auth[1];
  config.port = result.port;
  return config;
};

var ConnectionParameters = function(config) {
  config = typeof config == 'string' ? parse(config) : (config || {});
  this.user = val('user', config);
  this.database = val('database', config);
  this.port = parseInt(val('port', config));
  this.host = val('host', config);
  this.password = val('password', config);
  this.binary = val('binary', config);
  this.ssl = config.ssl || defaults.ssl;
};

module.exports = ConnectionParameters;

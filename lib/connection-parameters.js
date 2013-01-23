var dns = require('dns');
var path = require('path');

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
  //a domain socket begins with '/'
  this.isDomainSocket = (!(this.host||'').indexOf('/'));
};

var add = function(params, config, paramName) {
  var value = config[paramName];
  if(value) {
    params.push(paramName+"='"+value+"'");
  }
};

ConnectionParameters.prototype.getLibpqConnectionString = function(cb) {
  var params = []
  add(params, this, 'user');
  add(params, this, 'password');
  add(params, this, 'port');
  if(this.database) {
    params.push("dbname='" + this.database + "'");
  }
  if(this.isDomainSocket) {
    params.push("host=" + this.getDomainSocketName());
    return cb(null, params.join(' '));
  } 
  dns.lookup(this.host, function(err, address) {
    if(err) return cb(err, null);
    params.push("hostaddr=" + address);
    return cb(null, params.join(' '));
  });
};

ConnectionParameters.prototype.getDomainSocketName = function() {
  var filename =  '.s.PGSQL.' + this.port;

  //if host is full path to socket fd with port number, just return it
  if(this.host.indexOf(filename) > -1) return this.host;

  //otherwise, build it from host + standard filename + port
  return path.join(this.host, filename);
};

module.exports = ConnectionParameters;

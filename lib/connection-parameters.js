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
  var config;
  //unix socket
  if(str.charAt(0) === '/') {
    config = str.split(' ');
    return { host: config[0], database: config[1] };
  }
  // url parse expects spaces encoded as %20
  if(/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) str = encodeURI(str);
  var result = url.parse(str, true);
  config = {};
  if(result.protocol == 'socket:') {
    config.host = decodeURI(result.pathname);
    config.database = result.query.db;
    config.client_encoding = result.query.encoding;
    return config;
  }
  config.host = result.hostname;
  config.database = result.pathname ? decodeURI(result.pathname.slice(1)) : null;
  var auth = (result.auth || ':').split(':');
  config.user = auth[0];
  config.password = auth[1];
  config.port = result.port;

  var ssl = result.query.ssl;
  if (ssl === 'true' || ssl === '1') {
    config.ssl = true;
  }

  return config;
};

var useSsl = function() {
  switch(process.env.PGSSLMODE) {
  case "disable":
    return false;
  case "prefer":
  case "require":
  case  "verify-ca":
  case "verify-full":
    return true;
  }
  return defaults.ssl;
};

var ConnectionParameters = function(config) {
  config = typeof config == 'string' ? parse(config) : (config || {});
  this.user = val('user', config);
  this.database = val('database', config);
  this.port = parseInt(val('port', config), 10);
  this.host = val('host', config);
  this.password = val('password', config);
  this.binary = val('binary', config);
  this.ssl = config.ssl || useSsl();
  this.client_encoding = val("client_encoding", config);
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
  var params = [];
  add(params, this, 'user');
  add(params, this, 'password');
  add(params, this, 'port');
  if(this.database) {
    params.push("dbname='" + this.database + "'");
  }
  if(this.host) {
    params.push("host=" + this.host);
  }
  if(this.isDomainSocket) {
    return cb(null, params.join(' '));
  }
  if(this.client_encoding) {
    params.push("client_encoding='" + this.client_encoding + "'");
  }
  dns.lookup(this.host, function(err, address) {
    if(err) return cb(err, null);
    params.push("hostaddr=" + address);
    return cb(null, params.join(' '));
  });
};

module.exports = ConnectionParameters;

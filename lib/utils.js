var url = require('url');
var defaults = require(__dirname + "/defaults");
var events = require('events');

//compatibility for old nodes
if(typeof events.EventEmitter.prototype.once !== 'function') {
  events.EventEmitter.prototype.once = function (type, listener) {
    var self = this;
    self.on(type, function g () {
      self.removeListener(type, g);
      listener.apply(this, arguments);
    });
  };
}

var parseConnectionString = function(str) {
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

//allows passing false as property to remove it from config
var norm = function(config, propName) {
  config[propName] = (config[propName] || (config[propName] === false ? undefined : defaults[propName]))
};

//normalizes connection info
//which can be in the form of an object
//or a connection string
var normalizeConnectionInfo = function(config) {
  switch(typeof config) {
  case 'object':
    norm(config, 'user');
    norm(config, 'password');
    norm(config, 'host');
    norm(config, 'port');
    norm(config, 'database');
    return config;
  case 'string':
    return normalizeConnectionInfo(parseConnectionString(config));
  default:
    throw new Error("Unrecognized connection config parameter: " + config);
  }
};


var add = function(params, config, paramName) {
  var value = config[paramName];
  if(value) {
    params.push(paramName+"='"+value+"'");
  }
}

//builds libpq specific connection string
//from a supplied config object 
//the config object conforms to the interface of the config object
//accepted by the pure javascript client
var getLibpgConString = function(config, callback) {
  if(typeof config == 'object') {
    var params = []
    add(params, config, 'user');
    add(params, config, 'password');
    add(params, config, 'port');
    if(config.database) {
      params.push("dbname='" + config.database + "'");
    }
    if(config.host) {
      if(config.host != 'localhost' && config.host != '127.0.0.1') {
        //do dns lookup
        return require('dns').lookup(config.host, 4, function(err, address) {
          if(err) return callback(err, null);
          params.push("hostaddr="+address)
          callback(null, params.join(" "))
        })
      }
      params.push("hostaddr=127.0.0.1 ");
    }
    callback(null, params.join(" "));
  } else {
    throw new Error("Unrecognized config type for connection");
  }
}

module.exports = {
  normalizeConnectionInfo: normalizeConnectionInfo,
  //only exported here to make testing of this method possible
  //since it contains quite a bit of logic and testing for
  //each connection scenario in an integration test is impractical
  buildLibpqConnectionString: getLibpgConString,
  parseConnectionString: parseConnectionString
}

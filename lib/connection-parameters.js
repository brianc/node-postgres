/**
 * Copyright (c) 2010-2016 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var url = require('url');
var dns = require('dns');
var EventEmitter = require('events').EventEmitter;

var defaults = require('./defaults');

var val = function(key, config, envVar) {
  if (envVar === undefined) {
    envVar = process.env[ 'PG' + key.toUpperCase() ];
  } else if (envVar === false) {
    // do nothing ... use false
  } else {
    envVar = process.env[ envVar ];
  }

  return config[key] ||
    envVar ||
    defaults[key];
};

//parses a connection string
var parse = require('pg-connection-string').parse;

var useSsl = function() {
  switch(process.env.PGSSLMODE) {
  case "disable":
    return false;
  case "prefer":
  case "require":
  case "verify-ca":
  case "verify-full":
    return true;
  }
  return defaults.ssl;
};

var ConnectionParameters = function(config) {
  //if a string is passed, it is a raw connection string so we parse it into a config
  config = typeof config == 'string' ? parse(config) : (config || {});
  //if the config has a connectionString defined, parse IT into the config we use
  //this will override other default values with what is stored in connectionString
  if(config.connectionString) {
    config = parse(config.connectionString);
  }
  this.user = val('user', config);
  this.database = val('database', config);
  this.port = parseInt(val('port', config), 10);
  this.host = val('host', config);
  this.binary = val('binary', config);
  this.ssl = typeof config.ssl === 'undefined' ? useSsl() : config.ssl;
  this.client_encoding = val("client_encoding", config);
  //a domain socket begins with '/'
  this.isDomainSocket = (!(this.host||'').indexOf('/'));

  if (typeof(config.password) === 'function') {
    this.pwEmitter = new EventEmitter();
    var self = this;
    config.password(this, function (err, pw) {
      if (!err)
        self.password = pw;
      else if (err instanceof Error)
        self.password = err;
      else
        self.password = new Error('Password generator function failed: ' + err);

      var pwEmitter = self.pwEmitter;
      delete (self.pwEmitter);
      pwEmitter.emit('done', err);
    });
  } else {
    this.password = val('password', config);
  }

  this.application_name = val('application_name', config, 'PGAPPNAME');
  this.fallback_application_name = val('fallback_application_name', config, false);
};

var add = function(params, config, paramName) {
  var value = config[paramName];
  if(value) {
    params.push(paramName+"='"+value+"'");
  }
};

ConnectionParameters.prototype.getPassword = function(cb) {
  if (this.pwEmitter) {
    var self = this;
    this.pwEmitter.on('done', function (err) {
      cb(err, self.password);
    });
    return;
  }
  if (this.password instanceof Error) {
    cb(this.password);
  } else {
    cb(null, this.password);
  }
};

ConnectionParameters.prototype.getLibpqConnectionString = function(cb) {
  if (this.pwEmitter) {
    var self = this;
    this.pwEmitter.on('done', function (err) {
      if (err) {
        cb(err);
        return;
      }
      self.getLibpqConnectionString(cb);
    });
    return;
  }
  if (this.password instanceof Error) {
    cb(this.password);
    return;
  }
  var params = [];
  add(params, this, 'user');
  add(params, this, 'password');
  add(params, this, 'port');
  add(params, this, 'application_name');
  add(params, this, 'fallback_application_name');

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

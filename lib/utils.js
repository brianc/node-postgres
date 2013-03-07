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

// convert a JS array to a postgres array literal
// uses comma separator so won't work for types like box that use
// a different array separator.
function arrayString(val) {
	var result = '{';
	for (var i = 0 ; i < val.length; i++) {
		if(i > 0) {
			result = result + ',';
		}
		if(val[i] instanceof Date) {
			result = result + JSON.stringify(val[i]);
		}
		else if(typeof val[i] === 'undefined') {
			result = result + 'NULL';
		}
		else if(Array.isArray(val[i])) {
			result = result + arrayString(val[i]);
		}
		else
		{
			result = result +
				(val[i] === null ? 'NULL' : JSON.stringify(val[i]));
		}
	}
	result = result + '}';
	return result;
}

//converts values from javascript types
//to their 'raw' counterparts for use as a postgres parameter
//note: you can override this function to provide your own conversion mechanism
//for complex types, etc...
var prepareValue = function(val) {
  if(val instanceof Date) {
    return JSON.stringify(val);
  }
  if(typeof val === 'undefined') {
    return null;
  }
  if(Array.isArray(val)) {
    return arrayString(val);
  }
  return val === null ? null : val.toString();
};

function normalizeQueryConfig (config, values, callback) {
  //can take in strings or config objects
  config = (typeof(config) == 'string') ? { text: config } : config;
  if(values) {
    if(typeof values === 'function') {
      config.callback = values;
    } else {
      config.values = values;
    }
  }
  if(callback) {
    config.callback = callback;
  }
  return config;
}

module.exports = {
  prepareValue: prepareValue,
  normalizeQueryConfig: normalizeQueryConfig
};

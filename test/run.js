
//executes all the unit tests
var fs = require('fs');

var args = require(__dirname + '/cli');

var runDir = function(dir) {
  fs.readdirSync(dir).forEach(function(file) {
    if(file.indexOf(".js") < 0) {
      return runDir(fs.realpathSync(dir + file) + "/");
    }
    require(dir + file.split('.js') [0]);
  });
};

var arg = args.test;

if(arg == 'all') {
  runDir(__dirname+'/unit/');
  runDir(__dirname+'/integration/');
}
else {
  runDir(__dirname+'/' + arg + '/');
}


#! /usr/local/bin/node
//executes all the unit tests
var fs = require('fs');
var runDir = function(dir) {
  fs.readdirSync(dir).forEach(function(file) {
    if(file.indexOf(".js") < 0) {
      return runDir(fs.realpathSync(dir + file) + "/");
    }
    require(dir + file.split('.js') [0]);
  });
};
var arg = (process.argv[2] || "unit");
if(arg == 'all') {
  runDir(__dirname+'/test/unit/');
  runDir(__dirname+'/test/integration/');
}
else {
  runDir(__dirname+'/test/' + + '/');
}


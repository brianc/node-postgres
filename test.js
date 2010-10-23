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
runDir(__dirname+'/test/' + (process.argv[2] || "unit")+ '/');

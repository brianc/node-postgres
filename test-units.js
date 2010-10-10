//executes all the unit tests
var fs = require('fs');
var files = fs.readdirSync(__dirname + '/test/unit');
files.forEach(function(file){
  require(__dirname + '/test/unit/' + file.split('.js') [0]);
});

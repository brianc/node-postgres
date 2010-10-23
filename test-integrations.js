//executes all the integrationt tests
var fs = require('fs');
var directory = __dirname + '/test/integration/';
var files = fs.readdirSync(directory);
files.forEach(function(file){
  require(directory + file.split('.js') [0]);
});

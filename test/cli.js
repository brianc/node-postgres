var ConnectionParameters = require(__dirname + '/../lib/connection-parameters');
var config = new ConnectionParameters(process.argv[2]);

for(var i = 0; i < process.argv.length; i++) {
  switch(process.argv[i].toLowerCase()) {
  case 'native':
    config.native = true;
    break;
  case 'binary':
    config.binary = true;
    break;
  case 'down':
    config.down = true;
    break;
  default:
    break;
  }
}

module.exports = config;

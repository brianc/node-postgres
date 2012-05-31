var config = require(__dirname + '/../lib/utils').parseConnectionString(process.argv[2])

for(var i = 0; i < process.argv.length; i++) {
  switch(process.argv[i].toLowerCase()) {
  case 'native':
    config.native = true;
    break;
  case 'binary':
    config.binary = true;
    break;
  default:
    break;
  }
}

module.exports = config;

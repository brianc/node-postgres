var config = {
  port: 5432,
  host: 'localhost',
  user: 'postgres',
  database: 'postgres',
  password: '',
  test: 'unit'
};

var args = process.argv;
for(var i = 0; i < args.length; i++) {
  switch(args[i].toLowerCase()) {
  case '-u':
  case '--user':
    config.user = args[++i];
    break;
  case '--password':
    config.password = args[++i];
    break;
  case '--verbose':
    config.verbose = (args[++i] == "true");
    break;
  case '-d':
  case '--database':
    config.database = args[++i];
    break;
  case '-p':
  case '--port':
    config.port = args[++i];
    break;
  case '-h':
  case '--host':
    config.host = args[++i];
    break;
  case '--down':
    config.down = true;
    break;
  case '-t':
  case '--test':
    config.test = args[++i];
  case '--native':
    config.native = (args[++i] == "true");
  case '--binary':
    config.binary = (args[++i] == "true");
  default:
    break;
  }
}

var log = function(keys) {
  keys.forEach(function(key) {
    console.log(key + ": '" + config[key] + "'");
  });
}

module.exports = config;

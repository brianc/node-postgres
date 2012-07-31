var config = {};
if(process.argv[2]) {
  config = require(__dirname + '/../lib/utils').parseConnectionString(process.argv[2]);
}
//TODO use these environment variables in lib/ code
//http://www.postgresql.org/docs/8.4/static/libpq-envars.html
config.host = config.host || process.env['PGHOST'] || process.env['PGHOSTADDR'];
config.port = config.port || process.env['PGPORT'];
config.database = config.database || process.env['PGDATABASE'];
config.user = config.user || process.env['PGUSER'];
config.password = config.password || process.env['PGPASSWORD'];

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

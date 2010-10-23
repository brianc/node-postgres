require(__dirname + '/test-helper');

var pwClient = new Client({
  database: 'postgres',
  user: 'user_pw',
  password: 'pass'
});
pwClient.on('error', function(error) {
  console.log(error);
  throw error;
});
pwClient.connect();

pwClient.on('readyForQuery', function(){
  sys.debug("Connected with clear text password");
  pwClient.end();
});

var md5Client = new Client({
  database: 'postgres',
  user: 'user_md5',
  password: 'ssap'
});

md5Client.on('error', function(error) {
  console.log(error);
  throw error;
});

md5Client.connect();

md5Client.on('readyForQuery', function() {
  sys.debug("Connected with md5 password");
  md5Client.end();
});

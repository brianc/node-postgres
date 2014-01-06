var helper = require('./test-helper');
var Client = helper.Client;

var conInfo = helper.config;

function getConInfo(override) {
  var newConInfo = {};
  Object.keys(conInfo).forEach(function(k){
    newConInfo[k] = conInfo[k];
  });
  Object.keys(override || {}).forEach(function(k){
    newConInfo[k] = override[k];
  });
  return newConInfo;
}

function getAppName(conf, cb) {
  var client = new Client(conf);
  client.connect(assert.success(function(){
    client.query('SHOW application_name', assert.success(function(res){
      var appName = res.rows[0].application_name;
      cb(appName);
      client.end();
    }));
  }));
}

test('No default appliation_name ', function(){
  var conf = getConInfo();
  getAppName(conf, function(res){
    assert.strictEqual(res, '');
  });
});

test('fallback_application_name is used', function(){
  var fbAppName = 'this is my app';
  var conf = getConInfo({
    'fallback_application_name' : fbAppName
  });
  getAppName(conf, function(res){
    assert.strictEqual(res, fbAppName);
  });
});

test('application_name is used', function(){
  var appName = 'some wired !@#$% application_name';
  var conf = getConInfo({
    'application_name' : appName
  });
  getAppName(conf, function(res){
    assert.strictEqual(res, appName);
  });
});

test('application_name has precedence over fallback_application_name', function(){
  var appName = 'some wired !@#$% application_name';
  var fbAppName = 'some other strange $$test$$ appname';
  var conf = getConInfo({
    'application_name' : appName ,
    'fallback_application_name' : fbAppName
  });
  getAppName(conf, function(res){
    assert.strictEqual(res, appName);
  });
});

test('application_name from connection string', function(){
  var appName = 'my app';
  var conParams = require(__dirname + '/../../../lib/connection-parameters');
  var conf;
  if (process.argv[2]) {
    conf = new conParams(process.argv[2]+'?application_name='+appName);
  } else {
    conf = 'postgres://?application_name='+appName;
  }
  getAppName(conf, function(res){
    assert.strictEqual(res, appName);
  });
});



// TODO: make the test work for native client too
if (!helper.args.native) {
 test('application_name is read from the env', function(){
    var appName = process.env.PGAPPNAME = 'testest';
    var conf = getConInfo({
      'just some bla' : 'to fool the pool'
    });
    getAppName(conf, function(res){
      delete process.env.PGAPPNAME;
      assert.strictEqual(res, appName);
    });
  });
}
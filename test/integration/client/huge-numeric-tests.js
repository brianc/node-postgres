var helper = require(__dirname + '/test-helper');

helper.pg.connect(helper.config, assert.success(function(client, done) {
  var types = require(__dirname + '/../../../lib/types');
  //1231 = numericOID
  types.setTypeParser(1700, function(){
    return 'yes';
  })
  types.setTypeParser(1700, 'binary', function(){
    return 'yes';
  })
  var bignum = '294733346389144765940638005275322203805';
  client.query('CREATE TEMP TABLE bignumz(id numeric)');
  client.query('INSERT INTO bignumz(id) VALUES ($1)', [bignum]);
  client.query('SELECT * FROM bignumz', assert.success(function(result) {
    assert.equal(result.rows[0].id, 'yes')
    helper.pg.end();
    done();
  }))
}));

//custom type converter

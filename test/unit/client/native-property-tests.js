var helper = require(__dirname + "/test-helper");
var client = require(__dirname + "/../../../lib");

test('native property is non-enumerable', function() {
    assert.equal(Object.keys(client).indexOf('native'), -1);
});


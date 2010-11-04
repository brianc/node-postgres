//mostly just testing simple row api
require(__dirname + "/test-helper");
var Row = require('row');

test("is Array-like", function() {
  var row = new Row();
  test("has length", function() {
    assert.strictEqual(row.length, 0);
  });
  test("can push", function() {
    row.push(1);
    assert.length(row, 1);
    assert.strictEqual(row[0], 1);
  });
  test("can unshift", function() {
    row.unshift(2);
    assert.length(row, 2);
    assert.strictEqual(row[0], 2);
  });
});

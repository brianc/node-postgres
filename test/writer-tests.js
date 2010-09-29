require(__dirname + "/test-helper");


assert.equalBuffers = function(actual, expected) {
  if(actual.length != expected.length) {
    console.log(actual);
    console.log(expected);
    assert.equal(actual.length, expected.length);
  }
  for(var i = 0; i < actual.length; i++) {
    if(actual[i] != expected[i]) {
      console.log(actual);
      console.log(expected);
    }
    assert.equal(actual[i],expected[i]);
  }
}

BufferList.prototype.compare = function(expected) {
  var buf = this.join();
  assert.equalBuffers(buf, expected);
};

test('adds int16', function() {
  new BufferList().addInt16(5).compare([0, 5]);
});

test('adds two int16s', function() {
  new BufferList().addInt16(5).addInt16(3).compare([0,5,0,3]);
});

test('adds int32', function() {
  new BufferList().addInt32(1).compare([0,0,0,1]);
  new BufferList().addInt32(1).addInt32(3).compare([0,0,0,1,0,0,0,3]);
});

test('adds CStrings', function() {
  new BufferList().addCString('').compare([0]);
  new BufferList().addCString('!!').compare([33,33,0]);
  new BufferList().addCString('!').addCString('!').compare([33,0,33,0]);
});

test('computes length', function() {
  var buf = new BufferList().join(true);
  assert.equalBuffers(buf, [0,0,0,4]);
});

test('appends character', function() {
  var buf = new BufferList().join(false,'!');
  assert.equalBuffers(buf,[33]);
});

test('appends char and length', function() {
  var buf = new BufferList().join(true,'!');
  assert.equalBuffers(buf,[33,0,0,0,4]);
});

test('does complicated buffer', function() {
  var buf = new BufferList()
    .addInt32(1)
    .addInt16(2)
    .addCString('!')
    .join(true,'!');
  assert.equalBuffers(buf, [33, 0, 0, 0, 0x0c, 0, 0, 0, 1, 0, 2, 33, 0]);
});

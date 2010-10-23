require(__dirname + '/test-helper');

//this tests the monkey patching
//to ensure comptability with older
//versions of node
test("EventEmitter.once", function() {
  
  //an event emitter
  var stream = new MemoryStream();

  var callCount = 0;
  stream.once('single', function() {
    callCount++;
  });
  
  stream.emit('single');
  stream.emit('single');
  assert.equal(callCount, 1);
});

var helper = require(__dirname + '/test-helper')

var called = false;
test('disconnects', function() {
  called = true;
  var eventSink = new helper.Sink(1, function() {});
  helper.pg.on('end', function() {
    eventSink.add();
  });

  //this should exit the process
  helper.pg.end();
})



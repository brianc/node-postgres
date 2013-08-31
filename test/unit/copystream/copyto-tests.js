var helper = require(__dirname + '/../test-helper');
var CopyToStream =  require(__dirname + '/../../../lib/copystream').CopyToStream;
var DataCounter = function () {
  this.sendBytes = 0;
  this.recievedBytes = 0;
};
DataCounter.prototype = {
  send: function (buf) {
    this.sendBytes += buf.length;
    return buf;
  },
  recieve: function (chunk) {
    this.recievedBytes += chunk.length;    
  },
  assert: function () {
    assert.equal(this.sendBytes, this.recievedBytes, "data bytes send and recieved has to match"); 
  }
};
var buf1 = new Buffer("asdfasd"),
  buf2 = new Buffer("q03r90arf0aospd;"),
  buf3 = new Buffer(542),
  buf4 = new Buffer("93jfemialfjkasjlfas");
test('CopyToStream simple', function () {
  var stream = new CopyToStream(),
    dc = new DataCounter();
  assert.emits(stream, 'end', function () {}, '');
  stream.on('data', dc.recieve.bind(dc));
  stream.handleChunk(dc.send(buf1));
  stream.handleChunk(dc.send(buf2));
  stream.handleChunk(dc.send(buf3));
  stream.handleChunk(dc.send(buf4));
  dc.assert();
  stream.close();
});
test('CopyToStream pause/resume/close', function () {
  var stream = new CopyToStream(),
    dc = new DataCounter();
  stream.on('data', dc.recieve.bind(dc));
  assert.emits(stream, 'end', function () {}, 'stream has to emit end after closing');
  stream.pause();
  stream.handleChunk(dc.send(buf1));
  stream.handleChunk(dc.send(buf2));
  stream.handleChunk(dc.send(buf3));
  assert.equal(dc.recievedBytes, 0);
  stream.resume();
  dc.assert();
  stream.handleChunk(dc.send(buf2));
  dc.assert();
  stream.handleChunk(dc.send(buf3));
  dc.assert();
  stream.pause();
  stream.handleChunk(dc.send(buf4));
  assert(dc.sendBytes - dc.recievedBytes, buf4.length, "stream has not emit, data while it is in paused state");
  stream.resume();
  dc.assert();
  stream.close();
});
test('CopyToStream error', function () {
  var stream = new CopyToStream(),
    dc = new DataCounter();
  stream.on('data', dc.recieve.bind(dc));
  assert.emits(stream, 'error', function () {}, 'stream has to emit error event, when error method called');
  stream.handleChunk(dc.send(buf1));
  stream.handleChunk(dc.send(buf2));
  stream.error(new Error('test error'));
});
test('CopyToStream do not emit anything while paused', function () {
  var stream = new CopyToStream();
  stream.on('data', function () {
    assert.ok(false, "stream has not emit data when paused"); 
  });
  stream.on('end', function () {
    assert.ok(false, "stream has not emit end when paused"); 
  });
  stream.on('error', function () {
    assert.ok(false, "stream has not emit end when paused"); 
  });
  stream.pause();
  stream.handleChunk(buf2);
  stream.close();
  stream.error();
});
test('CopyToStream emit data and error after resume', function () {
  var stream = new CopyToStream(),
    paused;
  stream.on('data', function () {
    assert.ok(!paused, "stream has not emit data when paused"); 
  });
  stream.on('end', function () {
    assert.ok(!paused, "stream has not emit end when paused"); 
  });
  stream.on('error', function () {
    assert.ok(!paused, "stream has not emit end when paused"); 
  });
  paused = true;
  stream.pause();
  stream.handleChunk(buf2);
  stream.error();
  paused = false;
  stream.resume();
});
test('CopyToStream emit data and end after resume', function () {
  var stream = new CopyToStream(),
    paused;
  stream.on('data', function () {
    assert.ok(!paused, "stream has not emit data when paused"); 
  });
  stream.on('end', function () {
    assert.ok(!paused, "stream has not emit end when paused"); 
  });
  stream.on('error', function () {
    assert.ok(!paused, "stream has not emit end when paused"); 
  });
  paused = true;
  stream.pause();
  stream.handleChunk(buf2);
  stream.close();
  paused = false;
  stream.resume();
});



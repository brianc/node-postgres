var assert = require('assert')
var concat = require('concat-stream')
var tester = require('stream-tester')
var JSONStream = require('JSONStream')

var QueryStream = require('../')
var helper = require('./helper')

helper('close', function(client) {
  it('emits close', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    query.pipe(concat(function() {}))
    query.on('close', done)
  })
})

helper('early close', function(client) {
  it('can be closed early', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [20000], {batchSize: 2, highWaterMark: 2})
    var query = client.query(stream)
    var readCount = 0
    query.on('readable', function() {
      readCount++
      query.read()
    })
    query.once('readable', function() {
      query.close()
    })
    query.on('close', function() {
      assert(readCount < 10, 'should not have read more than 10 rows')
      done()
    })
  })
})

helper('should not throw errors after early close', function(client) {
  it('can be closed early without error', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 2000) num');
    var query = client.query(stream);
    var fetchCount = 0;
    var errorCount = 0;


    function waitForErrors() {

      setTimeout(function () {
        assert(errorCount === 0, 'should not throw a ton of errors');
        done();
      }, 10);
    }

    // hack internal _fetch function to force query.close immediately after _fetch is called (simulating the race condition)
    // race condition: if close is called immediately after _fetch is called, but before results are returned, errors are thrown
    // when the fetch results are pushed to the readable stream after its already closed.
    query._fetch = (function (_fetch) {
      return function () {

        // wait for the second fetch.  closing immediately after the first fetch throws an entirely different error :(
        if (fetchCount++ === 0) {
          return _fetch.apply(this, arguments);
        }

        var results = _fetch.apply(this, arguments);

        query.close();
        waitForErrors();

        query._fetch = _fetch; // we're done with our hack, so restore the original _fetch function.

        return results;
      }
    }(query._fetch));

    query.on('error', function () { errorCount++; });

    query.on('readable', function () {
      query.read();
    });
  });
});

helper('close callback', function (client) {
  it('notifies an optional callback when the conneciton is closed', function (done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [10], {batchSize: 2, highWaterMark: 2});
    var query = client.query(stream);
    query.once('readable', function() { // only reading once
      query.read();
    });
    query.once('readable', function() {
      query.close(function () {
        // nothing to assert.  This test will time out if the callback does not work.
        done();
      });
    });
    query.on('close', function () {
      assert(false, "close event should not fire"); // no close event because we did not read to the end of the stream.
    });
  });
});

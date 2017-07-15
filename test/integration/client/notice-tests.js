'use strict'
var helper = require('./test-helper')
const suite = new helper.Suite()

suite.test('emits notify message', function (done) {
  var client = helper.client()
  client.query('LISTEN boom', assert.calls(function () {
    var otherClient = helper.client()
    var bothEmitted = -1
    otherClient.query('LISTEN boom', assert.calls(function () {
      assert.emits(client, 'notification', function (msg) {
        // make sure PQfreemem doesn't invalidate string pointers
        setTimeout(function () {
          assert.equal(msg.channel, 'boom')
          assert.ok(msg.payload == 'omg!' /* 9.x */ || msg.payload == '' /* 8.x */, 'expected blank payload or correct payload but got ' + msg.message)
          client.end(++bothEmitted ? done : undefined)
        }, 100)
      })
      assert.emits(otherClient, 'notification', function (msg) {
        assert.equal(msg.channel, 'boom')
        otherClient.end(++bothEmitted ? done : undefined)
      })

      client.query("NOTIFY boom, 'omg!'", function (err, q) {
        if (err) {
          // notify not supported with payload on 8.x
          client.query('NOTIFY boom')
        }
      })
    }))
  }))
})

// this test fails on travis due to their config
suite.test('emits notice message', false, function (done) {
  if (helper.args.native) {
    console.error('need to get notice message working on native')
    return done()
  }
  // TODO this doesn't work on all versions of postgres
  var client = helper.client()
  const text = `
DO language plpgsql $$
BEGIN
  RAISE NOTICE 'hello, world!';
END
$$;
  `
  client.query(text, () => {
    client.end()
  })
  assert.emits(client, 'notice', function (notice) {
    assert.ok(notice != null)
    done()
  })
})

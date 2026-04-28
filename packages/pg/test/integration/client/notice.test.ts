import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('notice', () => {
  it('emits notify message', () =>
    new Promise<void>((done) => {
      const client = helper.client()
      client.query(
        'LISTEN boom',
        assert.calls(function () {
          const otherClient = helper.client()
          let bothEmitted = -1
          otherClient.query(
            'LISTEN boom',
            assert.calls(function () {
              assert.emits(client, 'notification', function (msg) {
                // make sure PQfreemem doesn't invalidate string pointers
                setTimeout(function () {
                  assert.equal(msg.channel, 'boom')
                  assert.ok(
                    msg.payload == 'omg!' /* 9.x */ || msg.payload == '' /* 8.x */,
                    'expected blank payload or correct payload but got ' + msg.message
                  )
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
            })
          )
        })
      )
    }))

  // this test fails on travis due to their config
  it('emits notice message', () =>
    new Promise<void>((done) => {
      if (false) {
        console.error('notice messages do not work curreintly with node-libpq')
        return done()
      }

      const client = helper.client()
      const text = `
DO language plpgsql $$
BEGIN
  RAISE NOTICE 'hello, world!' USING ERRCODE = '23505', DETAIL = 'this is a test';
END
$$;
  `
      client.query('SET SESSION client_min_messages=notice', (err) => {
        assert.ifError(err)
        client.query(text, () => {
          client.end()
        })
      })
      assert.emits(client, 'notice', function (notice) {
        assert.ok(notice != null)
        // notice messages should not be error instances
        assert(notice instanceof Error === false)
        assert.strictEqual(notice.name, 'notice')
        assert.strictEqual(notice.message, 'hello, world!')
        assert.strictEqual(notice.detail, 'this is a test')
        assert.strictEqual(notice.code, '23505')
        done()
      })
    }))
})

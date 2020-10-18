import Pool from '../'
import assert from 'assert'

describe('Connection strings', () => {
  it('pool delegates connectionString property to client', (done) => {
    const connectionString = 'postgres://foo:bar@baz:1234/xur'

    const pool = new Pool({
      // use a fake client so we can check we're passed the connectionString
      Client: function (args) {
        assert.strictEqual(args.connectionString, connectionString)
        return {
          connect: function (cb) {
            cb(new Error('testing'))
          },
          on: function () {},
        }
      },
      connectionString: connectionString,
    })

    pool.connect(function (err, client) {
      assert.notStrictEqual(err, undefined)
      done()
    })
  })
})

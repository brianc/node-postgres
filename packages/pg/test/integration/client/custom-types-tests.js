'use strict'
const helper = require('./test-helper')
const Client = helper.pg.Client
const suite = new helper.Suite()

const customTypes = {
  getTypeParser: () => () => 'okay!',
}

suite.test('custom type parser in client config', (done) => {
  const client = new Client({ types: customTypes })

  client.connect().then(() => {
    client.query(
      'SELECT NOW() as val',
      assert.success(function (res) {
        assert.equal(res.rows[0].val, 'okay!')
        client.end().then(done)
      })
    )
  })
})

// Custom type-parsers per query are not supported in native
if (!helper.args.native) {
  suite.test('custom type parser in query', (done) => {
    const client = new Client()

    client.connect().then(() => {
      client.query(
        {
          text: 'SELECT NOW() as val',
          types: customTypes,
        },
        assert.success(function (res) {
          assert.equal(res.rows[0].val, 'okay!')
          client.end().then(done)
        })
      )
    })
  })
}

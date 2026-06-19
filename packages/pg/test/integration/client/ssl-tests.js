'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const suite = new helper.Suite()

suite.test('can connect with ssl', function (done) {
  const config = {
    ...helper.config,
    ssl: {
      rejectUnauthorized: false,
    },
  }
  const client = new helper.pg.Client(config)
  client.connect(
    assert.success(function () {
      client.query(
        'SELECT NOW()',
        assert.success(function () {
          client.end(done)
        })
      )
    })
  )
})

async function getServerVersionNum() {
  const client = new helper.pg.Client(helper.config)
  await client.connect()
  try {
    const {
      rows: [row],
    } = await client.query('SHOW server_version_num')
    return parseInt(row.server_version_num, 10)
  } finally {
    await client.end()
  }
}

// The native client forwards sslnegotiation=direct to libpq, whose support
// for direct SSL depends on the linked libpq version (17+) rather than on
// this library. It also does not expose the underlying TLS socket, so the
// direct-negotiation check below is impossible. So we only test the pure-JS client.
if (!helper.args.native) {
  suite.test('can connect with direct SSL negotiation', async () => {
    // Direct SSL negotiation (sslnegotiation=direct) is only supported by
    // PostgreSQL 17 and newer servers. Probe the server version first and skip
    // on older servers rather than failing the test.
    const serverVersionNum = await getServerVersionNum()
    if (serverVersionNum < 170000) {
      console.log(`(skipped: direct SSL requires PostgreSQL 17+, server_version_num=${serverVersionNum}) `)
      return
    }

    const config = {
      ...helper.config,
      ssl: { rejectUnauthorized: false },
      sslnegotiation: 'direct',
    }
    const client = new helper.pg.Client(config)
    await client.connect()
    const { rows } = await client.query('SELECT NOW()')
    assert.strictEqual(rows.length, 1)

    // Verify the connection actually used direct SSL negotiation rather than
    // silently falling back to the traditional SSLRequest handshake. pg only
    // sends the 'postgresql' ALPN protocol on a direct SSL handshake (see
    // Connection#upgradeToSSL), and a PostgreSQL 17+ server echoes it back, so
    // its presence on the negotiated TLS socket confirms direct negotiation.
    const tlsSocket = client.connection.stream
    assert.ok(tlsSocket.encrypted, 'expected the connection to be upgraded to a TLS socket')
    assert.strictEqual(
      tlsSocket.alpnProtocol,
      'postgresql',
      'expected direct SSL negotiation to select the "postgresql" ALPN protocol'
    )

    await client.end()
  })
}

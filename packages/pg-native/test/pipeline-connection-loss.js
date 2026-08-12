const net = require('net')
const assert = require('assert')
const Client = require('../')

describe('pipeline reader', function () {
  let proxy
  let proxyPort
  let clientSockets

  beforeEach(function (done) {
    clientSockets = []
    proxy = net.createServer(function (client) {
      const upstream = net.connect(Number(process.env.PGPORT || 5432), process.env.PGHOST || 'localhost')
      clientSockets.push(client)
      client.pipe(upstream)
      upstream.pipe(client)
      client.on('error', function () {})
      upstream.on('error', function () {})
    })
    proxy.listen(0, '127.0.0.1', function () {
      proxyPort = proxy.address().port
      done()
    })
  })

  afterEach(function (done) {
    proxy.close(function () {
      done()
    })
  })

  // the batch starts the reader, so it has to stop it too. It used to leave the poll watcher armed,
  // and a later finish() then closed the handle under it.
  it('stops the reader it started once the batch is done', function (done) {
    const client = new Client()
    client.connect(`host=127.0.0.1 port=${proxyPort}`, function (err) {
      assert.ifError(err)
      let stopped = 0
      const stopReader = client.pq.stopReader.bind(client.pq)
      client.pq.stopReader = function () {
        stopped++
        return stopReader()
      }
      client.pipeline([{ text: 'SELECT 1' }, { text: 'SELECT 2' }], function (err) {
        assert.ifError(err)
        assert(stopped > 0, 'the reader started for the batch was never stopped')
        client.end()
        done()
      })
    })
  })

  // exitPipelineMode() on a busy connection appends its own complaint to libpq's error buffer, so
  // reading the message afterwards buried the reason the caller wanted.
  it('reports why the connection went away', function (done) {
    this.timeout(10000)
    const client = new Client()
    client.connect(`host=127.0.0.1 port=${proxyPort}`, function (err) {
      assert.ifError(err)
      client.pipeline([{ text: 'SELECT pg_sleep(10)' }], function (err) {
        assert(err, 'a batch cut off mid flight must fail')
        assert(
          !/cannot exit pipeline mode/.test(err.message),
          `error should say why the connection ended, got: ${err.message}`
        )
        client.end()
        done()
      })
      setTimeout(function () {
        clientSockets.forEach(function (socket) {
          socket.end()
        })
      }, 100)
    })
  })
})

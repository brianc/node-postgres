import pg from 'pg'

export default function (name, cb) {
  describe(name, function () {
    const client = new pg.Client()

    before(function (done) {
      client.connect(done)
    })

    cb(client)

    after(function (done) {
      client.end()
      client.on('end', done)
    })
  })
}

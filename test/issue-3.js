var pg = require('pg.js')
var QueryStream = require('../')
describe('end semantics race condition', function() {
  before(function(done) {
    var client = new pg.Client()
    client.connect()
    client.on('drain', client.end.bind(client))
    client.on('end', done)
    client.query('create table IF NOT EXISTS p(id serial primary key)')
    client.query('create table IF NOT EXISTS c(id int primary key references p)')
  })
  it('works', function(done) {
    var client1 = new pg.Client()
    client1.connect()
    var client2 = new pg.Client()
    client2.connect()

    var qr = new QueryStream("INSERT INTO p DEFAULT VALUES RETURNING id")
    client1.query(qr)
    var id = null
    qr.on('data', function(row) {
      id = row.id
    })
    qr.on('end', function () {
      client2.query("INSERT INTO c(id) VALUES ($1)", [id], function (err, rows) {
        client1.end()
        client2.end()
        done(err)
      })
    })
  })
})

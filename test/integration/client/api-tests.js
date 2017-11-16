'use strict'
var helper = require(__dirname + '/../test-helper')
var pg = helper.pg

var suite = new helper.Suite()

suite.test('pool callback behavior', done => {
  // test weird callback behavior with node-pool
  const pool = new pg.Pool()
  pool.connect(function (err) {
    assert(!err)
    arguments[1].emit('drain')
    arguments[2]()
    pool.end(done)
  })
})

suite.test('callback API', done => {
  const client = new helper.Client()
  client.query('CREATE TEMP TABLE peep(name text)')
  client.query('INSERT INTO peep(name) VALUES ($1)', ['brianc'])
  const config = {
    text: 'INSERT INTO peep(name) VALUES ($1)',
    values: ['brian']
  }
  client.query(config)
  client.query('INSERT INTO peep(name) VALUES ($1)', ['aaron'])

  client.query('SELECT * FROM peep ORDER BY name COLLATE "C"', (err, res) => {
    assert(!err)
    assert.equal(res.rowCount, 3)
    assert.deepEqual(res.rows, [
      {
        name: 'aaron'
      },
      {
        name: 'brian'
      },
      {
        name: 'brianc'
      }
    ])
    done()
  })
  client.connect(err => {
    assert(!err)
    client.once('drain', () => client.end())
  })
})

suite.test('executing nested queries', function (done) {
  const pool = new pg.Pool()
  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)
      client.query(
        'select now as now from NOW()',
        assert.calls(function (err, result) {
          assert.equal(new Date().getYear(), result.rows[0].now.getYear())
          client.query(
            'select now as now_again FROM NOW()',
            assert.calls(function () {
              client.query(
                'select * FROM NOW()',
                assert.calls(function () {
                  assert.ok('all queries hit')
                  release()
                  pool.end(done)
                })
              )
            })
          )
        })
      )
    })
  )
})

suite.test('raises error if cannot connect', function () {
  var connectionString = 'pg://sfalsdkf:asdf@localhost/ieieie'
  const pool = new pg.Pool({ connectionString: connectionString })
  pool.connect(
    assert.calls(function (err, client, done) {
      assert.ok(err, 'should have raised an error')
      done()
    })
  )
})

suite.test('query errors are handled and do not bubble if callback is provded', function (done) {
  const pool = new pg.Pool()
  pool.connect(
      assert.calls(function (err, client, release) {
        assert(!err)
        client.query(
          'SELECT OISDJF FROM LEIWLISEJLSE',
          assert.calls(function (err, result) {
            assert.ok(err)
            release()
            pool.end(done)
          })
        )
      })
    )
}
)

suite.test('callback is fired once and only once', function (done) {
  const pool = new pg.Pool()
  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)
      client.query('CREATE TEMP TABLE boom(name varchar(10))')
      var callCount = 0
      client.query(
        [
          "INSERT INTO boom(name) VALUES('hai')",
          "INSERT INTO boom(name) VALUES('boom')",
          "INSERT INTO boom(name) VALUES('zoom')"
        ].join(';'),
        function (err, callback) {
          assert.equal(
            callCount++,
            0,
            'Call count should be 0.  More means this callback fired more than once.'
          )
          release()
          pool.end(done)
        }
      )
    })
  )
})

suite.test('can provide callback and config object', function (done) {
  const pool = new pg.Pool()
  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)
      client.query(
        {
          name: 'boom',
          text: 'select NOW()'
        },
        assert.calls(function (err, result) {
          assert(!err)
          assert.equal(result.rows[0].now.getYear(), new Date().getYear())
          release()
          pool.end(done)
        })
      )
    })
  )
})

suite.test('can provide callback and config and parameters', function (done) {
  const pool = new pg.Pool()
  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)
      var config = {
        text: 'select $1::text as val'
      }
      client.query(
        config,
        ['hi'],
        assert.calls(function (err, result) {
          assert(!err)
          assert.equal(result.rows.length, 1)
          assert.equal(result.rows[0].val, 'hi')
          release()
          pool.end(done)
        })
      )
    })
  )
})

suite.test('null and undefined are both inserted as NULL', function (done) {
  const pool = new pg.Pool()
  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)
      client.query(
        'CREATE TEMP TABLE my_nulls(a varchar(1), b varchar(1), c integer, d integer, e date, f date)'
      )
      client.query(
        'INSERT INTO my_nulls(a,b,c,d,e,f) VALUES ($1,$2,$3,$4,$5,$6)',
        [null, undefined, null, undefined, null, undefined]
      )
      client.query(
        'SELECT * FROM my_nulls',
        assert.calls(function (err, result) {
          assert(!err)
          assert.equal(result.rows.length, 1)
          assert.isNull(result.rows[0].a)
          assert.isNull(result.rows[0].b)
          assert.isNull(result.rows[0].c)
          assert.isNull(result.rows[0].d)
          assert.isNull(result.rows[0].e)
          assert.isNull(result.rows[0].f)
          pool.end(done)
          release()
        })
      )
    })
  )
})

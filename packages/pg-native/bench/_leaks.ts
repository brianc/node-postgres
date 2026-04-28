import Client from '../src/index.ts'

type Cb = (err?: Error | null) => void

function series(ops: Array<(cb: Cb) => void>, done: Cb): void {
  let i = 0
  const next = (err?: Error | null): void => {
    if (err) return done(err)
    if (i >= ops.length) return done()
    const op = ops[i++]!
    op(next)
  }
  next()
}

function loop(): void {
  const client = new Client()

  const connect = (cb: Cb): void => {
    client.connect(cb)
  }

  const simpleQuery = (cb: Cb): void => {
    client.query('SELECT NOW()', cb)
  }

  const paramsQuery = (cb: Cb): void => {
    client.query('SELECT $1::text as name', ['Brian'], cb)
  }

  const prepared = (cb: Cb): void => {
    client.prepare('test', 'SELECT $1::text as name', 1, (err) => {
      if (err) return cb(err)
      client.execute('test', ['Brian'], cb)
    })
  }

  const sync = (cb: Cb): void => {
    client.querySync('SELECT NOW()')
    client.querySync('SELECT $1::text as name', ['Brian'])
    client.prepareSync('boom', 'SELECT $1::text as name', 1)
    client.executeSync('boom', ['Brian'])
    setImmediate(cb)
  }

  const end = (cb: Cb): void => {
    client.end(cb)
  }

  const ops = [connect, simpleQuery, paramsQuery, prepared, sync, end]

  const start = performance.now()
  series(ops, (err) => {
    if (err) throw err
    console.log(performance.now() - start)
    setImmediate(loop)
  })
}

// on my machine this will consume memory up to about 50 megs of ram
// and then stabilize at that point
loop()

import pgPkg from 'pg'
import Native from '../src/index.ts'

interface BenchPgClient {
  connect: (cb: () => void) => void
  query: (text: string, cb: (err?: Error | null) => void) => void
}

const pg = (pgPkg as unknown as { native: { Client: new () => BenchPgClient } }).native

type Cb = (err?: Error | null) => void

function warmup(fn: (cb: Cb) => void, cb: Cb): void {
  let count = 0
  const max = 10
  const run = (err?: Error | null): void => {
    if (err) return cb(err)
    if (max >= count++) {
      return fn(run)
    }
    cb()
  }
  run()
}

const native = new Native()
native.connectSync()

const queryText = 'SELECT generate_series(0, 1000) as X, generate_series(0, 1000) as Y, generate_series(0, 1000) as Z'
const client = new pg.Client()
client.connect(() => {
  const pure = (cb: Cb): void => {
    client.query(queryText, (err) => {
      if (err) throw err
      cb(err)
    })
  }
  const nativeQuery = (cb: Cb): void => {
    native.query(queryText, (err) => {
      if (err) throw err
      cb(err)
    })
  }

  const run = (): void => {
    console.time('pure')
    warmup(pure, () => {
      console.timeEnd('pure')
      console.time('native')
      warmup(nativeQuery, () => {
        console.timeEnd('native')
      })
    })
  }

  setInterval(() => {
    run()
  }, 500)
})

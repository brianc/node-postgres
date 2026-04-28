import pg from '../src/index.ts'

const queries = ['select CURRENT_TIMESTAMP', "select interval '1 day' + interval '1 hour'", "select TIMESTAMP 'today'"]

queries.forEach((query) => {
  const client = new pg.Client({
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
  })
  client.connect()
  ;(client.query(query) as unknown as { on(event: 'row', cb: (row: unknown) => void): void }).on('row', (row) => {
    console.log(row)
    client.end()
  })
})

import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './_test-helper.ts'

describe('simple-query', () => {
  const Query = helper.pg.Query

  it('simple query interface', async () => {
    const client = new helper.pg.Client()
    await client.connect()
    await helper.createPersonTable(client)

    await new Promise<void>((resolve, reject) => {
      const query = client.query(new Query('select name from person order by name collate "C"'))
      const rows: string[] = []
      let firstRow: Record<string, string> | undefined

      query.on('row', (row: Record<string, string>, result: unknown) => {
        try {
          assert.ok(result)
          if (!firstRow) firstRow = row
          rows.push(row.name)
        } catch (e) {
          reject(e)
        }
      })

      query.on('end', () => {
        try {
          assert.deepStrictEqual(firstRow, { name: firstRow!.name })
          assert.lengthIs(rows, 26)
          assert.equal(rows[0], 'Aaron')
          assert.equal(rows[25], 'Zanzabar')
          client.end(() => resolve())
        } catch (e) {
          reject(e)
        }
      })

      query.on('error', reject)
    })
  })

  it('prepared statements do not mutate params', async () => {
    const client = new helper.pg.Client()
    await client.connect()
    await helper.createPersonTable(client)

    await new Promise<void>((resolve, reject) => {
      const params = [1]
      const query = client.query(new Query('select name from person where $1 = 1 order by name collate "C"', params))

      try {
        assert.deepEqual(params, [1])
      } catch (e) {
        return reject(e)
      }

      const rows: Array<{ name: string }> = []
      query.on('row', (row: { name: string }, result: unknown) => {
        try {
          assert.ok(result)
          rows.push(row)
        } catch (e) {
          reject(e)
        }
      })

      query.on('end', (result: { rowCount: number }) => {
        try {
          assert.lengthIs(rows, 26, 'result returned wrong number of rows')
          assert.lengthIs(rows, result.rowCount)
          assert.equal(rows[0].name, 'Aaron')
          assert.equal(rows[25].name, 'Zanzabar')
          client.end(() => resolve())
        } catch (e) {
          reject(e)
        }
      })

      query.on('error', reject)
    })
  })

  it('multiple simple queries', async () => {
    const client = new helper.pg.Client()
    await client.connect()

    await new Promise<void>((resolve, reject) => {
      client.query({
        text: "create temp table bang(id serial, name varchar(5));insert into bang(name) VALUES('boom');",
      })
      client.query("insert into bang(name) VALUES ('yes');")
      const query = client.query(new Query('select name from bang'))

      const rows: string[] = []
      query.on('row', (row: Record<string, string>) => {
        rows.push(row.name)
      })
      query.on('end', () => {
        try {
          assert.deepStrictEqual(rows, ['boom', 'yes'])
          client.end(() => resolve())
        } catch (e) {
          reject(e)
        }
      })
      query.on('error', reject)
    })
  })

  it('multiple select statements', async () => {
    const client = new helper.pg.Client()
    await client.connect()

    await new Promise<void>((resolve, reject) => {
      client.query(
        'create temp table boom(age integer); insert into boom(age) values(1); insert into boom(age) values(2); insert into boom(age) values(3)'
      )
      client.query({
        text: "create temp table bang(name varchar(5)); insert into bang(name) values('zoom');",
      })
      const result = client.query(new Query({ text: 'select age from boom where age < 2; select name from bang' }))

      const rows: Array<Record<string, unknown>> = []
      result.on('row', (row: Record<string, unknown>) => {
        rows.push(row)
      })
      result.on('end', () => {
        try {
          assert.strictEqual(rows[0].age, 1)
          assert.strictEqual(rows[1].name, 'zoom')
          client.end(() => resolve())
        } catch (e) {
          reject(e)
        }
      })
      result.on('error', reject)
    })
  })
})

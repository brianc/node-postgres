import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'
import assert from 'node:assert'

describe('600', () => {
  // `async.series` from the `async` library replaced with a tiny native helper.
  const series = (steps: Array<(cb: (err?: Error) => void) => void>, done: (err?: Error) => void): void => {
    const run = (i: number): void => {
      if (i >= steps.length) return done()
      steps[i]((err) => {
        if (err) return done(err as never)
        run(i + 1)
      })
    }
    run(0)
  }

  const db = helper.client()

  type StepCallback = (err?: Error) => void

  function createTableFoo(callback: StepCallback): void {
    db.query('create temp table foo(column1 int, column2 int)', callback)
  }

  function createTableBar(callback: StepCallback): void {
    db.query('create temp table bar(column1 text, column2 text)', callback)
  }

  function insertDataFoo(callback: StepCallback): void {
    db.query(
      {
        name: 'insertFoo',
        text: 'insert into foo values($1,$2)',
        values: ['one', 'two'],
      },
      callback
    )
  }

  function insertDataBar(callback: StepCallback): void {
    db.query(
      {
        name: 'insertBar',
        text: 'insert into bar values($1,$2)',
        values: ['one', 'two'],
      },
      callback
    )
  }

  function startTransaction(callback: StepCallback): void {
    db.query('BEGIN', callback)
  }
  function endTransaction(callback: StepCallback): void {
    db.query('COMMIT', callback)
  }

  function doTransaction(callback: StepCallback): void {
    // The transaction runs startTransaction, then all queries, then endTransaction,
    // no matter if there has been an error in a query in the middle.
    startTransaction(function () {
      insertDataFoo(function () {
        insertDataBar(function () {
          endTransaction(callback)
        })
      })
    })
  }

  const steps = [createTableFoo, createTableBar, doTransaction, insertDataBar]

  it('test if query fails', () =>
    new Promise<void>((done) => {
      series(steps as never, () => {
        db.end()
        done()
      })
    }))

  it('test if prepare works but bind fails', () =>
    new Promise<void>((done) => {
      const client = helper.client()
      const q: { text: string; values: unknown[]; name: string } = {
        text: 'SELECT $1::int as name',
        values: ['brian'],
        name: 'test',
      }
      client.query(
        q,
        assert.calls(function (err, res) {
          q.values = [1]
          client.query(
            q,
            assert.calls(function (err, res) {
              assert.ifError(err)
              client.end()
              done()
            })
          )
        })
      )
    }))
})

import { Submittable, Connection, QueryResult } from 'pg'
const Result = require('pg/lib/result.js')
const EventEmitter = require('events').EventEmitter

let nextUniqueID = 1 // concept borrowed from org.postgresql.core.v3.QueryExecutorImpl

interface BatchQueryConfig {
  name?: string
  text: string
  values?: string[][] 
}

class BatchQuery extends EventEmitter implements Submittable  {

  name: string | null
  text: string
  values: string[][]
  connection: Connection | null
  _portal: string | null
  _result: typeof Result | null
  _results: typeof Result[]

  public constructor(batchQuery: BatchQueryConfig) {
    super()
    const { name, values, text } = batchQuery

    this.name = name
    this.values = values
    this.text = text
    this.connection = null
    this._portal = null
    this._result = new Result()
    this._results = []

    for (const row of values) {
      if (!Array.isArray(values)) {
        throw new Error('Batch commands require each set of values to be an array. e.g. values: any[][]')
      }
    }
  }

  public submit(connection: Connection): void {
    this.connection = connection

    // creates a named prepared statement
    this.connection.parse(
      {
        text: this.text,
        name: this.name,
        types: []
      },
      true
    )

    this.values.map(val => {
      this._portal = 'C_' + nextUniqueID++
      this.connection.bind({
        statement: this.name,
        values: val,
        portal: this._portal
      }, true)

      this.connection.describe({
        type: 'P',
        name: this._portal,
      }, true)

      this.connection.execute({portal: this._portal}, true)
    })

    this.connection.sync()
  }

  execute(): Promise<QueryResult[]> {
    let promise

    // TODO: handle if there is a callback provided?
    if (!this.callback) {
      promise = new Promise((resolve, reject) => {
        this.callback = (err, rows) => (err ? reject(err) : resolve(rows))
      })
    }

    // Return the promise (or undefined)
    return promise
  }

  handleError(err, connection) {
    console.log(err)
  }

  handleReadyForQuery(con) {
    if (this._canceledDueToError) {
      return this.handleError(this._canceledDueToError, con)
    }
    if (this.callback) {
      try {
        this.callback(null, this._results)
      }
      catch(err) {
        process.nextTick(() => {
          throw err
        })
      }
    }
    this.emit('end', this._results)
  }

  handleRowDescription(msg) {
    this._result.addFields(msg.fields)
  }

  handleDataRow(msg) {
    const row = this._result.parseRow(msg.fields)
    this._result.addRow(row)
  }

  handleCommandComplete(msg) {
    this._result.addCommandComplete(msg)
    this._results.push(this._result)
    this._result = new Result()
    this.connection.close({ type: 'P', name: this._portal }, true)
  }


  handleEmptyQuery() {
    this.connection.sync()
  }
}

export = BatchQuery

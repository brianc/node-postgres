import assert from 'node:assert'

import { it } from 'vitest'

import Connection from '../../../src/connection.ts'
import { Client } from '../../_test-helper.ts'

it('drain', () =>
  new Promise<void>((resolve, reject) => {
    const con = new Connection({ stream: 'NO' as unknown as never })
    const client = new Client({ connection: con })
    ;(con as unknown as { connect: () => void }).connect = () => {
      con.emit('connect')
    }
    ;(con as unknown as { query: () => void }).query = () => {}
    client.connect(() => {})

    let raisedDrain = false
    client.on('drain', () => {
      raisedDrain = true
    })

    client.query('hello')
    client.query('sup')
    client.query('boom')
    assert.equal(raisedDrain, false)
    con.emit('readyForQuery')

    assert.equal(raisedDrain, false)
    con.emit('readyForQuery')
    con.emit('readyForQuery')
    assert.equal(raisedDrain, false)
    con.emit('readyForQuery')

    process.nextTick(() => {
      try {
        assert.ok(raisedDrain)
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  }))

import assert from 'node:assert'
import { EventEmitter } from 'node:events'

import { it } from 'vitest'

import Client from '../../../src/client.ts'
import Connection from '../../../src/connection.ts'

it('emits end when not in query', () =>
  new Promise<void>((resolve) => {
    const stream = new EventEmitter() as EventEmitter & {
      setNoDelay?: () => void
      connect?: () => void
      write?: () => void
    }
    stream.setNoDelay = () => {}
    stream.connect = () => {}
    stream.write = () => {}

    const client = new Client({ connection: new Connection({ stream: stream as never }) })
    let endHit = false
    let errorHit = false

    client.on('end', () => {
      endHit = true
      if (errorHit) resolve()
    })
    client.on('error', () => {
      errorHit = true
      if (endHit) resolve()
    })

    client.connect(() => {
      client.query('SELECT NOW()', (err) => {
        assert(err)
      })
    })
    client.connection.emit('connect')
    process.nextTick(() => {
      client.connection.emit('readyForQuery')
      process.nextTick(() => {
        stream.emit('close')
      })
    })
  }))

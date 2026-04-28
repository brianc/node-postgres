import { Client } from 'pg'
import { beforeAll, describe, it } from 'vitest'
import QueryStream from '../src/index.ts'

describe('end semantics race condition', () => {
  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const client = new Client()
        client.connect()
        client.on('drain', client.end.bind(client))
        client.on('end', () => resolve())
        client.query('create table IF NOT EXISTS p(id serial primary key)')
        client.query('create table IF NOT EXISTS c(id int primary key references p)')
      })
  )

  it('works', () =>
    new Promise<void>((resolve, reject) => {
      const client1 = new Client()
      client1.connect()
      const client2 = new Client()
      client2.connect()

      const qr = new QueryStream('INSERT INTO p DEFAULT VALUES RETURNING id')
      client1.query(qr)
      let id: number | null = null
      qr.on('data', (row: { id: number }) => {
        id = row.id
      })
      qr.on('end', () => {
        client2.query('INSERT INTO c(id) VALUES ($1)', [id], (err) => {
          client1.end()
          client2.end()
          err ? reject(err) : resolve()
        })
      })
    }))
})

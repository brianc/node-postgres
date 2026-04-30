import { pseudoRandomBytes } from 'node:crypto'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('many connections', () => {
  describe('async', () => {
    function test(count: number, times: number): void {
      it(`connecting ${count} clients ${times} times`, async () => {
        const connectClient = (): Promise<void> =>
          new Promise((resolve, reject) => {
            const client = new Client()
            client.connect((err) => {
              if (err) return reject(err)
              pseudoRandomBytes(1000, (err2, chunk) => {
                if (err2) return reject(err2)
                client.query('SELECT $1::text as txt', [chunk.toString('base64')], (err3) => {
                  if (err3) return reject(err3)
                  client.end((err4) => (err4 ? reject(err4) : resolve()))
                })
              })
            })
          })

        for (let t = 0; t < times; t++) {
          await Promise.all(Array.from({ length: count }, () => connectClient()))
        }
      }, 200000)
    }

    test(1, 1)
    test(5, 5)
    test(10, 10)
    test(20, 20)
    test(30, 10)
  })
})

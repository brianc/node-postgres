import { Client } from 'pg'
import { afterAll, beforeAll, describe } from 'vitest'

export default function helper(name: string, cb: (client: Client) => void): void {
  describe(name, () => {
    const client = new Client()

    beforeAll(async () => {
      await client.connect()
    })

    cb(client)

    afterAll(async () => {
      await client.end()
    })
  })
}

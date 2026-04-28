import Cursor from 'pg-cursor'
import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('submittle', () => {
  // Originally pending in the mocha suite (signature was `it(title, false, fn)`).
  it.skip('is returned from the query method', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool()
      const cursor: any = pool.query(new Cursor('SELECT * from generate_series(0, 1000)') as any)
      cursor.read((err: Error | undefined, rows: unknown[]) => {
        expect(err).toBe(undefined)
        expect(!!rows).toBeTruthy()
        cursor.close(() => resolve())
      })
    }))
})

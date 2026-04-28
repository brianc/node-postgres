import { describe, it, expect } from 'vitest'
import QueryStream from 'pg-query-stream'

describe('pg-query-stream', () => {
  it('exports QueryStream constructor as default', () => {
    expect(new QueryStream('SELECT 1')).toBeTruthy()
  })
})

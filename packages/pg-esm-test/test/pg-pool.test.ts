import { describe, it, expect } from 'vitest'
import Pool from 'pg-pool'

describe('pg-pool', () => {
  it('exports Pool constructor', () => {
    expect(new Pool()).toBeTruthy()
  })
})

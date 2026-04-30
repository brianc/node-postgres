import { describe, it, expect } from 'vitest'
import Cursor from 'pg-cursor'

describe('pg-cursor', () => {
  it('exports Cursor constructor as default', () => {
    expect(new Cursor('SELECT 1')).toBeTruthy()
  })
})

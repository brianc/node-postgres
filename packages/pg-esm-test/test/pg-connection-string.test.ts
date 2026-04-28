import { describe, it, expect } from 'vitest'
import { parse, toClientConfig, parseIntoClientConfig } from 'pg-connection-string'

describe('pg-connection-string', () => {
  it('exports parse function', () => {
    expect(typeof parse).toBe('function')
  })

  it('exports toClientConfig function', () => {
    expect(typeof toClientConfig).toBe('function')
  })

  it('exports parseIntoClientConfig function', () => {
    expect(typeof parseIntoClientConfig).toBe('function')
  })
})

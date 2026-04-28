import { describe, it, expect } from 'vitest'
import pg, {
  Client,
  Pool,
  Connection,
  defaults,
  types,
  DatabaseError,
  escapeIdentifier,
  escapeLiteral,
  Result,
  TypeOverrides,
} from 'pg'

describe('pg', () => {
  it('exports Client constructor', () => {
    expect(new Client()).toBeTruthy()
  })

  it('exports Pool constructor', () => {
    expect(new Pool()).toBeTruthy()
  })

  it('still provides default export', () => {
    expect(new pg.Pool()).toBeTruthy()
  })

  it('exports Connection constructor', () => {
    expect(new Connection()).toBeTruthy()
  })

  it('exports defaults', () => {
    expect(defaults).toBeTruthy()
  })

  it('exports types', () => {
    expect(types).toBeTruthy()
  })

  it('exports DatabaseError', () => {
    expect(DatabaseError).toBeTruthy()
  })

  it('exports escapeIdentifier', () => {
    expect(escapeIdentifier).toBeTruthy()
  })

  it('exports escapeLiteral', () => {
    expect(escapeLiteral).toBeTruthy()
  })

  it('exports Result', () => {
    expect(Result).toBeTruthy()
  })

  it('exports TypeOverrides', () => {
    expect(TypeOverrides).toBeTruthy()
  })
})

import assert from 'assert'
import { describe, it } from 'test'
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
  it('should export Client constructor', () => {
    assert.ok(new Client())
  })

  it('should export Pool constructor', () => {
    assert.ok(new Pool())
  })

  it('should still provide default export', () => {
    assert.ok(new pg.Pool())
  })

  it('should export Connection constructor', () => {
    assert.ok(new Connection())
  })

  it('should export defaults', () => {
    assert.ok(defaults)
  })

  it('should export types', () => {
    assert.ok(types)
  })

  it('should export DatabaseError', () => {
    assert.ok(DatabaseError)
  })

  it('should export escapeIdentifier', () => {
    assert.ok(escapeIdentifier)
  })

  it('should export escapeLiteral', () => {
    assert.ok(escapeLiteral)
  })

  it('should export Result', () => {
    assert.ok(Result)
  })

  it('should export TypeOverrides', () => {
    assert.ok(TypeOverrides)
  })
})

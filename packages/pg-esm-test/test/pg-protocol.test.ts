import { describe, it, expect } from 'vitest'
import { DatabaseError, NoticeMessage } from 'pg-protocol/messages'
import { serialize } from 'pg-protocol/serializer'

describe('pg-protocol', () => {
  it('exports DatabaseError', () => {
    expect(DatabaseError).toBeTruthy()
  })

  it('exports NoticeMessage', () => {
    expect(NoticeMessage).toBeTruthy()
  })

  it('exports serialize', () => {
    expect(serialize).toBeTruthy()
    expect(typeof serialize.startup).toBe('function')
  })
})

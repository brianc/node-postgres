import protocol, { NoticeMessage, DatabaseError } from 'pg-protocol/dist/messages.js'
import { describe, it } from 'node:test'
import { strict as assert } from 'assert'
import { execFileSync } from 'node:child_process'

describe('pg-protocol', () => {
  it('should export database error', () => {
    assert.ok(DatabaseError)
  })
  it('should export protocol', () => {
    assert.ok(protocol)
    assert.ok(protocol.noData)
    assert.ok(protocol.parseComplete)
    assert.ok(protocol.NoticeMessage)
  })
  it('should export NoticeMessage from file in dist folder', () => {
    assert.ok(NoticeMessage)
  })
  it('should load the ESM entry without module syntax detection', () => {
    const flags = process.allowedNodeEnvironmentFlags.has('--experimental-detect-module')
      ? ['--no-experimental-detect-module']
      : []
    const script =
      "import { parse, serialize, DatabaseError } from 'pg-protocol'; if (!parse || !serialize || !DatabaseError) process.exit(1)"
    execFileSync(process.execPath, [...flags, '--input-type=module', '-e', script], {
      cwd: new URL('.', import.meta.url),
      stdio: 'pipe',
    })
  })
})

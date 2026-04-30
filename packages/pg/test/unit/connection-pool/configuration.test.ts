import assert from 'node:assert'

import { it } from 'vitest'

import { pg } from '../../_test-helper.ts'

it('pool with copied settings includes password', () => {
  const original = new pg.Pool({ password: 'original' as never })
  const copy = new pg.Pool((original as unknown as { options: unknown }).options as never)
  assert.equal((copy as unknown as { options: { password: string } }).options.password, 'original')
})

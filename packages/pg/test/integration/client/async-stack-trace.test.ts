import { describe, it } from 'vitest'
import helper from '../_test-helper.ts'

describe('async-stack-trace', () => {
  const pg = helper.pg

  process.on('unhandledRejection', function (e: unknown) {
    console.error(e, (e as Error).stack)
    process.exit(1)
  })
  // these tests will only work for if --async-stack-traces is on, which is the default starting in node 16.
  const NODE_MAJOR_VERSION = +process.versions.node.split('.')[0]
  if (NODE_MAJOR_VERSION >= 16) {
    it('promise API async stack trace in pool', async function outerFunction() {
      async function innerFunction() {
        const pool = new pg.Pool()
        await pool.query('SELECT test from nonexistent')
      }
      try {
        await innerFunction()
        throw Error('should have errored')
      } catch (e) {
        const err = e as Error
        const stack = err.stack ?? ''
        if (!stack.includes('innerFunction') || !stack.includes('outerFunction')) {
          throw Error('async stack trace does not contain wanted values: ' + stack)
        }
      }
    })

    it('promise API async stack trace in client', async function outerFunction() {
      async function innerFunction() {
        const client = new pg.Client()
        await client.connect()
        try {
          await client.query('SELECT test from nonexistent')
        } finally {
          client.end()
        }
      }
      try {
        await innerFunction()
        throw Error('should have errored')
      } catch (e) {
        const err = e as Error
        const stack = err.stack ?? ''
        if (!stack.includes('innerFunction') || !stack.includes('outerFunction')) {
          throw Error('async stack trace does not contain wanted values: ' + stack)
        }
      }
    })
  }
})

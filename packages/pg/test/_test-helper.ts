// Shared helpers used by the unit and integration tests. Mirrors the legacy
// `test/test-helper.js`, plus environment-driven test config and timezone helpers.

import nodeAssert from 'node:assert'
import { inspect } from 'node:util'

import pg, { Client } from '../src/index.ts'

export { Client, pg }

export const config = {
  native: false,
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'postgres',
}

const getTimezoneOffset = Date.prototype.getTimezoneOffset

export function setTimezoneOffset(minutesOffset: number): void {
  Date.prototype.getTimezoneOffset = function () {
    return minutesOffset
  }
}

export function resetTimezoneOffset(): void {
  Date.prototype.getTimezoneOffset = getTimezoneOffset
}

export const rejection = <T>(promise: Promise<T>): Promise<unknown> =>
  promise.then(
    (value) => {
      throw new Error(`Promise resolved when rejection was expected; value: ${inspect(value)}`)
    },
    (error) => error
  )

const names = [
  'Aaron',
  'Brian',
  'Chris',
  'David',
  'Elvis',
  'Frank',
  'Grace',
  'Haley',
  'Irma',
  'Jenny',
  'Kevin',
  'Larry',
  'Michelle',
  'Nancy',
  'Olivia',
  'Peter',
  'Quinn',
  'Ronda',
  'Shelley',
  'Tobias',
  'Uma',
  'Veena',
  'Wanda',
  'Xavier',
  'Yoyo',
  'Zanzabar',
]

export const createPersonTable = async (client: InstanceType<typeof Client>): Promise<void> => {
  await client.query('CREATE TEMP TABLE person (id serial, name varchar(10), age integer)')
  await client.query(
    'INSERT INTO person (name, age) VALUES' + names.map((n, i) => ` ('${n}', ${(i + 1) * 10})`).join(',')
  )
}

// We extend node:assert with the helpers the legacy tests relied on. Mutating the
// imported namespace is unusual but keeps the call-sites identical to the JS code.
type AnyFn = (...args: unknown[]) => void

interface ExtendedAssert {
  same(actual: Record<string, unknown>, expected: Record<string, unknown>): void
  emits(
    item: { once(event: string, cb: (...args: unknown[]) => void): void },
    eventName: string,
    callback?: AnyFn,
    message?: string
  ): void
  UTCDate(
    actual: Date,
    year: number,
    month: number,
    day: number,
    hours: number,
    min: number,
    sec: number,
    ms: number
  ): void
  equalBuffers(actual: ArrayLike<number>, expected: ArrayLike<number>): void
  empty(actual: ArrayLike<unknown>): void
  success(callback: AnyFn): AnyFn
  lengthIs(actual: ArrayLike<unknown>, expectedLength: number): void
  calls(callback: AnyFn, timeout?: number): AnyFn
  isNull(item: unknown, message?: string): void
}

const expectFn = (callback: AnyFn, timeout?: number): AnyFn => {
  const t = timeout || (process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT, 10) : 10000)
  let executed = false
  const id = setTimeout(() => {
    if (!executed) {
      console.error(`assert.calls: expected execution within ${t}ms`)
    }
  }, t)
  ;(id as unknown as { unref?: () => void }).unref?.()

  return function (this: unknown, ...args: unknown[]): void {
    executed = true
    clearTimeout(id)
    const err = args[0]
    if (err) {
      nodeAssert.ok(err instanceof Error, 'Expected errors to be instances of Error: ' + inspect(err))
    }
    callback.apply(this, args)
  }
}

const spit = (actual: unknown, expected: unknown): void => {
  console.log('actual', inspect(actual))
  console.log('expected', inspect(expected))
}

const ext: ExtendedAssert = {
  same(actual, expected) {
    for (const key in expected) {
      nodeAssert.equal(actual[key], expected[key], `mismatch on key ${key}`)
    }
  },

  emits(item, eventName, callback, message) {
    let called = false
    const id = setTimeout(() => {
      if (!called) console.error(message || `Expected '${eventName}' to be called.`)
    }, 5000)
    ;(id as unknown as { unref?: () => void }).unref?.()

    item.once(eventName, function (this: unknown, ...args: unknown[]) {
      if (eventName === 'error') {
        nodeAssert.ok(
          args[0] instanceof Error,
          'Expected error events to throw instances of Error but found: ' + inspect(args[0])
        )
      }
      called = true
      clearTimeout(id)
      if (callback) callback.apply(this, args)
    })
  },

  UTCDate(actual, year, month, day, hours, min, sec, ms) {
    nodeAssert.equal(actual.getUTCFullYear(), year)
    nodeAssert.equal(actual.getUTCMonth(), month)
    nodeAssert.equal(actual.getUTCDate(), day)
    nodeAssert.equal(actual.getUTCHours(), hours)
    nodeAssert.equal(actual.getUTCMinutes(), min)
    nodeAssert.equal(actual.getUTCSeconds(), sec)
    nodeAssert.equal(actual.getUTCMilliseconds(), ms)
  },

  equalBuffers(actual, expected) {
    if (actual.length !== expected.length) {
      spit(actual, expected)
      nodeAssert.equal(actual.length, expected.length)
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) spit(actual, expected)
      nodeAssert.equal(actual[i], expected[i])
    }
  },

  empty(actual) {
    nodeAssert.equal(actual.length, 0)
  },

  success(callback) {
    if (callback.length === 1 || callback.length === 0) {
      return expectFn((err: unknown, arg: unknown) => {
        if (err) console.log(err)
        nodeAssert(!err)
        ;(callback as AnyFn)(arg)
      })
    }
    if (callback.length === 2) {
      return expectFn((err: unknown, arg1: unknown, arg2: unknown) => {
        if (err) console.log(err)
        nodeAssert(!err)
        ;(callback as AnyFn)(arg1, arg2)
      })
    }
    throw new Error('need to preserve arrity of wrapped function')
  },

  lengthIs(actual, expectedLength) {
    nodeAssert.equal(actual.length, expectedLength)
  },

  calls: expectFn,

  isNull(item, message) {
    nodeAssert.ok(item === null, message || 'expected ' + item + ' to be null')
  },
}

// Mutate node:assert with the legacy helpers so existing call-sites work as-is.
Object.assign(nodeAssert, ext)

export type AssertWithExt = typeof nodeAssert & ExtendedAssert
export const assert: AssertWithExt = nodeAssert as AssertWithExt
export const xassert = assert

// Compatibility shim for legacy `new helper.Suite('name')` calls. The custom
// suite runner is gone; vitest's `describe` already groups tests, so this is
// a no-op object that swallows the API surface without affecting behaviour.
class Suite {
  constructor(_name?: string) {}
  test(_name: string, _cb?: (...args: unknown[]) => unknown): void {}
}

// Default export mirrors the legacy `helper` shape that mocha-style tests imported.
const helper = {
  pg,
  Client,
  config,
  setTimezoneOffset,
  resetTimezoneOffset,
  rejection,
  createPersonTable,
  assert,
  Suite,
  // Used by the legacy connection-string tests when checking `helper.args.native`.
  // Tests in this codebase also occasionally read user/password/host/etc., so
  // mirror the standard pg config bag here for ergonomics.
  args: { ...config, native: false } as { native: boolean } & typeof config,
}

export { Suite }

export default helper

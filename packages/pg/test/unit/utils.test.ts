import assert from 'node:assert'
import { Buffer } from 'node:buffer'

import { describe, it } from 'vitest'

import defaults from '../../src/defaults.ts'
import * as utils from '../../src/utils.ts'
import { resetTimezoneOffset, setTimezoneOffset } from '../_test-helper.ts'

describe('utils', () => {
  it('ensure types is exported on root object', async () => {
    const pg = await import('../../src/index.ts')
    assert(pg.types)
    assert(pg.types.getTypeParser)
    assert(pg.types.setTypeParser)
  })

  it('normalizing query configs', () => {
    const callback = (): void => {}

    let config = utils.normalizeQueryConfig({ text: 'TEXT' })
    assert.deepEqual(config, { text: 'TEXT' })

    config = utils.normalizeQueryConfig({ text: 'TEXT' }, [10])
    assert.deepEqual(config, { text: 'TEXT', values: [10] })

    config = utils.normalizeQueryConfig({ text: 'TEXT', values: [10] })
    assert.deepEqual(config, { text: 'TEXT', values: [10] })

    config = utils.normalizeQueryConfig('TEXT', [10], callback)
    assert.deepEqual(config, { text: 'TEXT', values: [10], callback })

    config = utils.normalizeQueryConfig({ text: 'TEXT', values: [10] }, callback)
    assert.deepEqual(config, { text: 'TEXT', values: [10], callback })
  })

  it('prepareValues: buffer prepared properly', () => {
    const buf = Buffer.from('quack')
    const out = utils.prepareValue(buf)
    assert.strictEqual(buf, out)
  })

  it('prepareValues: Uint8Array prepared properly', () => {
    const buf = new Uint8Array([1, 2, 3]).subarray(1, 2)
    const out = utils.prepareValue(buf) as Buffer
    assert.ok(Buffer.isBuffer(out))
    assert.equal(out.length, 1)
    assert.deepEqual(out[0], 2)
  })

  it('prepareValues: date prepared properly', () => {
    setTimezoneOffset(-330)
    const date = new Date(2014, 1, 1, 11, 11, 1, 7)
    const out = utils.prepareValue(date)
    assert.strictEqual(out, '2014-02-01T11:11:01.007+05:30')
    resetTimezoneOffset()
  })

  it('prepareValues: date prepared properly as UTC', () => {
    defaults.parseInputDatesAsUTC = true
    const date = new Date(Date.UTC(2014, 1, 1, 11, 11, 1, 7))
    const out = utils.prepareValue(date)
    assert.strictEqual(out, '2014-02-01T11:11:01.007+00:00')
    defaults.parseInputDatesAsUTC = false
  })

  it('prepareValues: BC date prepared properly', () => {
    setTimezoneOffset(-330)
    const date = new Date(-3245, 1, 1, 11, 11, 1, 7)
    const out = utils.prepareValue(date)
    assert.strictEqual(out, '3246-02-01T11:11:01.007+05:30 BC')
    resetTimezoneOffset()
  })

  it('prepareValues: 1 BC date prepared properly', () => {
    setTimezoneOffset(-330)
    const date = new Date('0000-02-01T11:11:01.007')
    const out = utils.prepareValue(date)
    assert.strictEqual(out, '0001-02-01T11:11:01.007+05:30 BC')
    resetTimezoneOffset()
  })

  it('prepareValues: undefined prepared properly', () => {
    const out = utils.prepareValue(undefined)
    assert.strictEqual(out, null)
  })

  it('prepareValue: null prepared properly', () => {
    const out = utils.prepareValue(null)
    assert.strictEqual(out, null)
  })

  it('prepareValue: true prepared properly', () => {
    assert.strictEqual(utils.prepareValue(true), 'true')
  })

  it('prepareValue: false prepared properly', () => {
    assert.strictEqual(utils.prepareValue(false), 'false')
  })

  it('prepareValue: number prepared properly', () => {
    assert.strictEqual(utils.prepareValue(3.042), '3.042')
  })

  it('prepareValue: string prepared properly', () => {
    assert.strictEqual(utils.prepareValue('big bad wolf'), 'big bad wolf')
  })

  it('prepareValue: simple array prepared properly', () => {
    const out = utils.prepareValue([1, null, 3, undefined, [5, 6, 'squ,awk']])
    assert.strictEqual(out, '{"1",NULL,"3",NULL,{"5","6","squ,awk"}}')
  })

  it('prepareValue: complex array prepared properly', () => {
    const out = utils.prepareValue([{ x: 42 }, { y: 84 }])
    assert.strictEqual(out, '{"{\\"x\\":42}","{\\"y\\":84}"}')
  })

  it('prepareValue: date array prepared properly', () => {
    setTimezoneOffset(-330)
    const date = new Date(2014, 1, 1, 11, 11, 1, 7)
    const out = utils.prepareValue([date])
    assert.strictEqual(out, '{"2014-02-01T11:11:01.007+05:30"}')
    resetTimezoneOffset()
  })

  it('prepareValue: arbitrary objects prepared properly', () => {
    const out = utils.prepareValue({ x: 42 })
    assert.strictEqual(out, '{"x":42}')
  })

  it('prepareValue: objects with simple toPostgres prepared properly', () => {
    const customType = { toPostgres: () => 'zomgcustom!' }
    assert.strictEqual(utils.prepareValue(customType), 'zomgcustom!')
  })

  it('prepareValue: buffer array prepared properly', () => {
    const a = Buffer.from('dead', 'hex')
    const b = Buffer.from('beef', 'hex')
    assert.strictEqual(utils.prepareValue([a, b]), '{\\\\xdead,\\\\xbeef}')
  })

  it('prepareValue: Uint8Array array prepared properly', () => {
    const a = Uint8Array.from(Buffer.from('dead', 'hex'))
    const b = Uint8Array.from(Buffer.from('beef', 'hex'))
    assert.strictEqual(utils.prepareValue([a, b]), '{\\\\xdead,\\\\xbeef}')
  })

  it('prepareValue: objects with complex toPostgres prepared properly', () => {
    const customType = { toPostgres: () => [1, 2] }
    assert.strictEqual(utils.prepareValue(customType), '{"1","2"}')
  })

  it('prepareValue: objects with toPostgres receive prepareValue', () => {
    const customRange = {
      lower: { toPostgres: () => 5 },
      upper: { toPostgres: () => 10 },
      toPostgres(prepare: (val: unknown) => unknown) {
        return '[' + prepare(this.lower) + ',' + prepare(this.upper) + ']'
      },
    }
    assert.strictEqual(utils.prepareValue(customRange), '[5,10]')
  })

  it('prepareValue: objects with circular toPostgres rejected', () => {
    const customType: { toPostgres: () => unknown } = {
      toPostgres() {
        return { toPostgres: () => customType }
      },
    }
    try {
      utils.prepareValue(customType)
    } catch (e) {
      assert.ok((e as Error).message.match(/circular/), 'Expected circular reference error but got ' + e)
      return
    }
    throw new Error('Expected prepareValue to throw exception')
  })

  it('prepareValue: can map an array of values including those with toPostgres functions', () => {
    const customType = { toPostgres: () => 'zomgcustom!' }
    const values: unknown[] = [1, 'test', customType]
    const out = values.map(utils.prepareValue)
    assert.deepEqual(out, [1, 'test', 'zomgcustom!'])
  })

  describe('escapeLiteral', () => {
    const cases: Array<[string, unknown, string]> = [
      ['no special characters', 'hello world', "'hello world'"],
      ['contains double quotes only', 'hello " world', "'hello \" world'"],
      ['contains single quotes only', "hello ' world", "'hello '' world'"],
      ['contains backslashes only', 'hello \\ world', " E'hello \\\\ world'"],
      ['contains single quotes and double quotes', 'hello \' " world', "'hello '' \" world'"],
      ['date', new Date(), "''"],
      ['null', null, "''"],
      ['undefined', undefined, "''"],
      ['boolean false', false, "''"],
      ['number', 1, "''"],
      ['boolean true', true, "''"],
      ['array', [1, 2, 3], "''"],
      ['object', { x: 42 }, "''"],
      ['contains double quotes and backslashes', 'hello \\ " world', " E'hello \\\\ \" world'"],
      ['contains single quotes and backslashes', "hello \\ ' world", " E'hello \\\\ '' world'"],
      ['contains single quotes, double quotes, and backslashes', 'hello \\ \' " world', " E'hello \\\\ '' \" world'"],
    ]
    for (const [name, input, expected] of cases) {
      it(name, () => {
        assert.equal(utils.escapeLiteral(input), expected)
      })
    }
  })

  describe('escapeIdentifier', () => {
    const cases: Array<[string, string, string]> = [
      ['no special characters', 'hello world', '"hello world"'],
      ['contains double quotes only', 'hello " world', '"hello "" world"'],
      ['contains single quotes only', "hello ' world", '"hello \' world"'],
      ['contains backslashes only', 'hello \\ world', '"hello \\ world"'],
      ['contains single quotes and double quotes', 'hello \' " world', '"hello \' "" world"'],
      ['contains double quotes and backslashes', 'hello \\ " world', '"hello \\ "" world"'],
      ['contains single quotes and backslashes', "hello \\ ' world", '"hello \\ \' world"'],
      ['contains single quotes, double quotes, and backslashes', 'hello \\ \' " world', '"hello \\ \' "" world"'],
    ]
    for (const [name, input, expected] of cases) {
      it(name, () => {
        assert.equal(utils.escapeIdentifier(input), expected)
      })
    }
  })
})

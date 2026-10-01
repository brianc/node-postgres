'use strict'
const helper = require('./test-helper')
const utils = require('../../lib/utils')
const defaults = require('../../lib/defaults')
const assert = require('assert')
const suite = new helper.Suite()

const cases = [
  ['Europe/Paris', '1890-01-01T12:00:00.123Z', '1890-01-01T12:09:21.123+00:09:21'],
  ['America/New_York', '1880-01-01T12:00:00.123Z', '1880-01-01T07:03:58.123-04:56:02'],
  ['Asia/Kathmandu', '1890-01-01T12:00:00.123Z', '1890-01-01T17:41:16.123+05:41:16'],
  ['Africa/Monrovia', '1970-01-01T00:00:00.000Z', '1969-12-31T23:15:30.000-00:44:30'],
  ['Europe/Paris', '2014-02-01T11:11:01.007Z', '2014-02-01T12:11:01.007+01:00'],
  ['UTC', '1890-01-01T12:00:00.123Z', '1890-01-01T12:00:00.123+00:00'],
  ['Europe/Paris', '0000-01-01T12:00:00.123Z', '0001-01-01T12:09:21.123+00:09:21 BC'],
]

for (const [zone, iso, expected] of cases) {
  suite.test(`Date serialization in ${zone} at ${iso}`, function () {
    const oldTz = process.env.TZ
    try {
      process.env.TZ = zone
      const date = new Date(iso)
      assert.strictEqual(utils.prepareValue(date), expected)
      assert.strictEqual(date.toISOString(), iso)
    } finally {
      if (oldTz === undefined) delete process.env.TZ
      else process.env.TZ = oldTz
    }
  })
}

suite.test('UTC Date serialization does not use the historical local offset', function () {
  const oldTz = process.env.TZ
  const oldParseInputDatesAsUTC = defaults.parseInputDatesAsUTC
  try {
    process.env.TZ = 'Africa/Monrovia'
    defaults.parseInputDatesAsUTC = true
    assert.strictEqual(utils.prepareValue(new Date(0)), '1970-01-01T00:00:00.000+00:00')
  } finally {
    defaults.parseInputDatesAsUTC = oldParseInputDatesAsUTC
    if (oldTz === undefined) delete process.env.TZ
    else process.env.TZ = oldTz
  }
})

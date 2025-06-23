'use strict'
const assert = require('assert')
const sys = require('util')

const Suite = require('./suite')
const args = require('./cli')

const Client = require('./../lib').Client

process.on('uncaughtException', function (d) {
  if ('stack' in d && 'message' in d) {
    console.log('Message: ' + d.message)
    console.log(d.stack)
  } else {
    console.log(d)
  }
  process.exit(-1)
})
const expect = function (callback, timeout) {
  const executed = false
  timeout = timeout || parseInt(process.env.TEST_TIMEOUT) || 5000
  const id = setTimeout(function () {
    assert.ok(
      executed,
      'Expected execution of function to be fired within ' +
        timeout +
        ' milliseconds ' +
        ' (hint: export TEST_TIMEOUT=<timeout in milliseconds>' +
        ' to change timeout globally)' +
        callback.toString()
    )
  }, timeout)

  if (callback.length < 3) {
    return function (err, queryResult) {
      clearTimeout(id)
      if (err) {
        assert.ok(err instanceof Error, 'Expected errors to be instances of Error: ' + sys.inspect(err))
      }
      callback.apply(this, arguments)
    }
  } else if (callback.length == 3) {
    return function (err, arg1, arg2) {
      clearTimeout(id)
      if (err) {
        assert.ok(err instanceof Error, 'Expected errors to be instances of Error: ' + sys.inspect(err))
      }
      callback.apply(this, arguments)
    }
  } else {
    throw new Error('Unsupported arrity ' + callback.length)
  }
}
// print out the filename
process.stdout.write(require('path').basename(process.argv[1]))
if (args.binary) process.stdout.write(' (binary)')
if (args.native) process.stdout.write(' (native)')

process.on('exit', function () {
  console.log('')
})

process.on('uncaughtException', function (err) {
  console.error('\n %s', err.stack || err.toString())
  // causes xargs to abort right away
  process.exit(255)
})

const getTimezoneOffset = Date.prototype.getTimezoneOffset

const setTimezoneOffset = function (minutesOffset) {
  Date.prototype.getTimezoneOffset = function () {
    return minutesOffset
  }
}

const resetTimezoneOffset = function () {
  Date.prototype.getTimezoneOffset = getTimezoneOffset
}

const rejection = (promise) =>
  promise.then(
    (value) => {
      throw new Error(`Promise resolved when rejection was expected; value: ${sys.inspect(value)}`)
    },
    (error) => error
  )

if (Object.isExtensible(assert)) {
  assert.same = function (actual, expected) {
    for (const key in expected) {
      assert.equal(actual[key], expected[key])
    }
  }

  assert.emits = function (item, eventName, callback, message) {
    let called = false
    const id = setTimeout(function () {
      test("Should have called '" + eventName + "' event", function () {
        assert.ok(called, message || "Expected '" + eventName + "' to be called.")
      })
    }, 5000)

    item.once(eventName, function () {
      if (eventName === 'error') {
        // belt and braces test to ensure all error events return an error
        assert.ok(
          arguments[0] instanceof Error,
          'Expected error events to throw instances of Error but found: ' + sys.inspect(arguments[0])
        )
      }
      called = true
      clearTimeout(id)
      assert.ok(true)
      if (callback) {
        callback.apply(item, arguments)
      }
    })
  }

  assert.UTCDate = function (actual, year, month, day, hours, min, sec, milisecond) {
    const actualYear = actual.getUTCFullYear()
    assert.equal(actualYear, year, 'expected year ' + year + ' but got ' + actualYear)

    const actualMonth = actual.getUTCMonth()
    assert.equal(actualMonth, month, 'expected month ' + month + ' but got ' + actualMonth)

    const actualDate = actual.getUTCDate()
    assert.equal(actualDate, day, 'expected day ' + day + ' but got ' + actualDate)

    const actualHours = actual.getUTCHours()
    assert.equal(actualHours, hours, 'expected hours ' + hours + ' but got ' + actualHours)

    const actualMin = actual.getUTCMinutes()
    assert.equal(actualMin, min, 'expected min ' + min + ' but got ' + actualMin)

    const actualSec = actual.getUTCSeconds()
    assert.equal(actualSec, sec, 'expected sec ' + sec + ' but got ' + actualSec)

    const actualMili = actual.getUTCMilliseconds()
    assert.equal(actualMili, milisecond, 'expected milisecond ' + milisecond + ' but got ' + actualMili)
  }

  const spit = function (actual, expected) {
    console.log('')
    console.log('actual ' + sys.inspect(actual))
    console.log('expect ' + sys.inspect(expected))
    console.log('')
  }

  assert.equalBuffers = function (actual, expected) {
    if (actual.length != expected.length) {
      spit(actual, expected)
      assert.equal(actual.length, expected.length)
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] != expected[i]) {
        spit(actual, expected)
      }
      assert.equal(actual[i], expected[i])
    }
  }

  assert.empty = function (actual) {
    assert.lengthIs(actual, 0)
  }

  assert.success = function (callback) {
    if (callback.length === 1 || callback.length === 0) {
      return assert.calls(function (err, arg) {
        if (err) {
          console.log(err)
        }
        assert(!err)
        callback(arg)
      })
    } else if (callback.length === 2) {
      return assert.calls(function (err, arg1, arg2) {
        if (err) {
          console.log(err)
        }
        assert(!err)
        callback(arg1, arg2)
      })
    } else {
      throw new Error('need to preserve arrity of wrapped function')
    }
  }

  assert.lengthIs = function (actual, expectedLength) {
    assert.equal(actual.length, expectedLength)
  }

  assert.calls = expect

  assert.isNull = function (item, message) {
    message = message || 'expected ' + item + ' to be null'
    assert.ok(item === null, message)
  }
}

module.exports = {
  Suite: Suite,
  pg: require('./../lib/'),
  args: args,
  config: args,
  sys: sys,
  Client: Client,
  setTimezoneOffset: setTimezoneOffset,
  resetTimezoneOffset: resetTimezoneOffset,
  rejection: rejection,
}

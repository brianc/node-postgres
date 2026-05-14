'use strict'
const assert = require('assert')
const sys = require('util')

const Suite = require('./suite')
const Client = require('./../lib').Client

let isNativeMode = false
for (let i = 0; i < process.argv.length; i++) {
  switch (process.argv[i].toLowerCase()) {
    case 'native':
      isNativeMode = true
      break
  }
}

process.on('uncaughtException', function (d) {
  if ('stack' in d && 'message' in d) {
    console.log('Message: ' + d.message)
    console.log(d.stack)
  } else {
    console.log(d)
  }
  // causes xargs to abort right away
  process.exit(255)
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
if (isNativeMode) process.stdout.write(' (native)')

process.on('exit', function () {
  console.log('')
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

const createPersonTable = async (client) => {
  await client.query('CREATE TEMP TABLE person (id serial, name varchar(10), age integer)')
  await client.query(
    'INSERT INTO person (name, age) VALUES' + names.map((name, i) => ` ('${name}', ${(i + 1) * 10})`).join(',')
  )
}

module.exports = {
  Suite: Suite,
  pg: require('./../lib/'),
  args: { native: isNativeMode },
  config: {
    native: isNativeMode,
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
  },
  sys: sys,
  Client: Client,
  setTimezoneOffset: setTimezoneOffset,
  resetTimezoneOffset: resetTimezoneOffset,
  createPersonTable: createPersonTable,
}

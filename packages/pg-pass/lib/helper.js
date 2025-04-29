'use strict'

const path = require('path'),
  Stream = require('stream').Stream,
  split = require('split2'),
  util = require('util'),
  defaultPort = 5432

let warnStream = process.stderr

let isWin = process.platform === 'win32'
const S_IRWXG = 56, //    00070(8)
  S_IRWXO = 7, //    00007(8)
  S_IFMT = 61440, // 00170000(8)
  S_IFREG = 32768 //  0100000(8)
function isRegFile(mode) {
  return (mode & S_IFMT) == S_IFREG
}

const fieldNames = ['host', 'port', 'database', 'user', 'password']
const nrOfFields = fieldNames.length
const passKey = fieldNames[nrOfFields - 1]

function warn() {
  const isWritable = warnStream instanceof Stream && true === warnStream.writable

  if (isWritable) {
    const args = Array.prototype.slice.call(arguments).concat('\n')
    warnStream.write(util.format.apply(util, args))
  }
}

Object.defineProperty(module.exports, 'isWin', {
  get: function () {
    return isWin
  },
  set: function (val) {
    isWin = val
  },
})

module.exports.warnTo = function (stream) {
  const old = warnStream
  warnStream = stream
  return old
}

module.exports.getFileName = function (rawEnv) {
  const env = rawEnv || process.env
  const file =
    env.PGPASSFILE ||
    (isWin ? path.join(env.APPDATA || './', 'postgresql', 'pgpass.conf') : path.join(env.HOME || './', '.pgpass'))
  return file
}

module.exports.usePgPass = function (stats, fname) {
  if (Object.prototype.hasOwnProperty.call(process.env, 'PGPASSWORD')) {
    return false
  }

  if (isWin) {
    return true
  }

  fname = fname || '<unkn>'

  if (!isRegFile(stats.mode)) {
    warn('WARNING: password file "%s" is not a plain file', fname)
    return false
  }

  if (stats.mode & (S_IRWXG | S_IRWXO)) {
    /* If password file is insecure, alert the user and ignore it. */
    warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname)
    return false
  }

  return true
}

const matcher = (module.exports.match = function (connInfo, entry) {
  return fieldNames.slice(0, -1).reduce(function (prev, field, idx) {
    if (idx == 1) {
      // the port
      if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
        return prev && true
      }
    }
    return prev && (entry[field] === '*' || entry[field] === connInfo[field])
  }, true)
})

module.exports.getPassword = function (connInfo, stream, cb) {
  let pass
  const lineStream = stream.pipe(split())

  function onLine(line) {
    const entry = parseLine(line)
    if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
      pass = entry[passKey]
      lineStream.end() // -> calls onEnd(), but pass is set now
    }
  }

  const onEnd = function () {
    stream.destroy()
    cb(pass)
  }

  const onErr = function (err) {
    stream.destroy()
    warn('WARNING: error on reading file: %s', err)
    cb(undefined)
  }

  stream.on('error', onErr)
  lineStream.on('data', onLine).on('end', onEnd).on('error', onErr)
}

const parseLine = (module.exports.parseLine = function (line) {
  if (line.length < 11 || line.match(/^\s+#/)) {
    return null
  }

  let curChar = ''
  let prevChar = ''
  let fieldIdx = 0
  let startIdx = 0
  let obj = {}
  let isLastField = false
  const addToObj = function (idx, i0, i1) {
    let field = line.substring(i0, i1)

    if (!Object.hasOwnProperty.call(process.env, 'PGPASS_NO_DEESCAPE')) {
      field = field.replace(/\\([:\\])/g, '$1')
    }

    obj[fieldNames[idx]] = field
  }

  for (let i = 0; i < line.length - 1; i += 1) {
    curChar = line.charAt(i + 1)
    prevChar = line.charAt(i)

    isLastField = fieldIdx == nrOfFields - 1

    if (isLastField) {
      addToObj(fieldIdx, startIdx)
      break
    }

    if (i >= 0 && curChar == ':' && prevChar !== '\\') {
      addToObj(fieldIdx, startIdx, i + 1)

      startIdx = i + 2
      fieldIdx += 1
    }
  }

  obj = Object.keys(obj).length === nrOfFields ? obj : null

  return obj
})

const isValidEntry = (module.exports.isValidEntry = function (entry) {
  const rules = {
    // host
    0: function (x) {
      return x.length > 0
    },
    // port
    1: function (x) {
      if (x === '*') {
        return true
      }
      x = Number(x)
      return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x
    },
    // database
    2: function (x) {
      return x.length > 0
    },
    // username
    3: function (x) {
      return x.length > 0
    },
    // password
    4: function (x) {
      return x.length > 0
    },
  }

  for (let idx = 0; idx < fieldNames.length; idx += 1) {
    const rule = rules[idx]
    const value = entry[fieldNames[idx]] || ''

    const res = rule(value)
    if (!res) {
      return false
    }
  }

  return true
})

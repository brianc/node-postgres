'use strict'

const fs = require('fs'),
  helper = require('./helper.js')
module.exports = function (connInfo, cb) {
  const file = helper.getFileName()

  fs.stat(file, function (err, stat) {
    if (err || !helper.usePgPass(stat, file)) {
      return cb(undefined)
    }

    const st = fs.createReadStream(file)

    helper.getPassword(connInfo, st, cb)
  })
}

module.exports.warnTo = helper.warnTo

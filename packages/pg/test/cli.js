'use strict'
const ConnectionParameters = require('../lib/connection-parameters')
const config = new ConnectionParameters(process.argv[2])

for (const arg of process.argv) {
  switch (arg.toLowerCase()) {
    case 'native':
      config.native = true
      break
    case 'binary':
      config.binary = true
      break
    case 'down':
      config.down = true
      break
    default:
      break
  }
}

if (process.env['PG_TEST_NATIVE']) {
  config.native = true
}

module.exports = config

'use strict'
var helper = require('./test-helper')

helper.testPoolSize(1)

helper.testPoolSize(2)

helper.testPoolSize(40)

helper.testPoolSize(200)

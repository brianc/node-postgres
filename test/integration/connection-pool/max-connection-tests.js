var helper = require(__dirname + "/test-helper")
return console.log('BAD RACE CONDITION');
helper.testPoolSize(10);
helper.testPoolSize(11);

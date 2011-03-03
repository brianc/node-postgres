var helper = require(__dirname + '/../test-helper');

if(helper.args.native) {
  Client = require(__dirname + '/../../lib/native').Client;
}
//export parent helper stuffs
module.exports = helper;


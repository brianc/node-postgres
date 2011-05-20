var helper = require(__dirname + '/../test-helper');

//TODO would this be better served set at ../test-helper?
if(helper.args.native) {
  Client = require(__dirname + '/../../lib/native').Client;
  helper.pg = helper.pg.native;
}
//export parent helper stuffs
module.exports = helper;


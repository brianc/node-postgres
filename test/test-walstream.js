'use strict';

const WalStream = require(__dirname + '/../lib').WalStream;

var lastLsn = null;

var walStream = new WalStream({});
function proc() {
  walStream.getChanges('test_slot', lastLsn, {
    includeXids: false, //default: false
    includeTimestamp: false, //default: false
    skipEmptyXacts: true, //default: true
  }, function(err) {
    if (err) {
      console.log('Logical replication initialize error', err);
      setTimeout(proc, 1000);
    }
  });
}

walStream.on('data', function(msg) {
  lastLsn = msg.lsn || lastLsn;
  console.log('log recv', msg);
}).on('error', function(err) {
  console.log('Error #2', err);
  setTimeout(proc, 1000);
});

proc();

//If want to stop replication
//walStream.stop();

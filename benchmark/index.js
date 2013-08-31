var async = require('async');
var max = 10000;
var maxTimes = 3;
var doLoops = function(bench, loops, times, cb) {
  var start = new Date();
  var count = 0;

  var done = function() {
    var duration = (new Date() - start)
    var seconds = (duration / 1000);
    console.log("%d ops/sec - (%d/%d)", ~~(loops/seconds), loops, seconds);
    var next = loops * 10;
    if(next > max) {
      if(times > maxTimes) return cb();
      times++;
      next = max;
    }
    setTimeout(function() {
      doLoops(bench, next, times, cb);
    }, 100);
  }

  var run = function() {
    if(count++ >= loops){
      return done();
    }
    bench(function() {
      setImmediate(run);
    });
  }
  run();
}
var bench = require(__dirname + '/simple-query-parsing');
console.log();
var benches = ['simple-query-parsing', 'prepared-statement-parsing'];
async.forEachSeries(benches, function(name, cb) {
  var bench = require(__dirname + '/' + name)();
  console.log('starting ', name);
  doLoops(bench, 100, 1, cb);
}, function(err, res) {
  console.log('done')
})

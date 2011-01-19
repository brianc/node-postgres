//result object returned from query
//in the 'end' event and also
//passed as second argument to provided callback
var Result = function() {
  this.rows = [];
};

var p = Result.prototype;

//adds a command complete message
p.addCommandComplete = function(msg) {
  var splitMsg = msg.text.split(' ');
  this.commandType = splitMsg.shift();
  this.rowCount = splitMsg.pop();
  //with INSERT we have oid in the middle
  if(splitMsg.length) {
    this.oid = splitMsg[0];
  }
};

p.addRow = function(row) {
  this.rows.push(row);
};

module.exports = Result;

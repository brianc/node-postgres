//result object returned from query
//in the 'end' event and also
//passed as second argument to provided callback
var Result = function() {
  this.command = null;
  this.rowCount = null;
  this.oid = null;
  this.rows = [];
};

var p = Result.prototype;

var matchRegexp = /([A-Za-z]+) (\d+ )?(\d+)?/

//adds a command complete message
p.addCommandComplete = function(msg) {
  if(msg.text) {
    //pure javascript
    var match = matchRegexp.exec(msg.text);
  } else {
    //native bindings
    var match = matchRegexp.exec(msg.command);
  }
  if(match) {
    this.command = match[1];
    //match 3 will only be existing on insert commands
    if(match[3]) {
      //msg.value is from native bindings
      this.rowCount = parseInt(match[3] || msg.value);
      this.oid = parseInt(match[2]);
    } else {
      this.rowCount = parseInt(match[2]);
    }
  }
};

p.addRow = function(row) {
  this.rows.push(row);
};

module.exports = Result;

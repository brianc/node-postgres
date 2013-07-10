var types = require(__dirname + '/types/');

//result object returned from query
//in the 'end' event and also
//passed as second argument to provided callback
var Result = function(rowMode) {
  this.command = null;
  this.rowCount = null;
  this.oid = null;
  this.rows = [];
  this.fields = [];
  this._parsers = [];
  if(rowMode == "array") {
    this.parseRow = this._parseRowAsArray;
  }
};

var matchRegexp = /([A-Za-z]+) ?(\d+ )?(\d+)?/;

//adds a command complete message
Result.prototype.addCommandComplete = function(msg) {
  var match;
  if(msg.text) {
    //pure javascript
    match = matchRegexp.exec(msg.text);
  } else {
    //native bindings
    match = matchRegexp.exec(msg.command);
  }
  if(match) {
    this.command = match[1];
    //match 3 will only be existing on insert commands
    if(match[3]) {
      //msg.value is from native bindings
      this.rowCount = parseInt(match[3] || msg.value, 10);
      this.oid = parseInt(match[2], 10);
    } else {
      this.rowCount = parseInt(match[2], 10);
    }
  }
};

Result.prototype._parseRowAsArray = function(rowData) {
  var row = [];
  for(var i = 0, len = rowData.length; i < len; i++) {
    var rawValue = rowData[i];
    if(rawValue !== null) {
      row.push(this._parsers[i](rawValue));
    } else {
      row.push(null);
    }
  }
  return row;
};

//rowData is an array of text or binary values
//this turns the row into a JavaScript object
Result.prototype.parseRow = function(rowData) {
  var row = {};
  for(var i = 0, len = rowData.length; i < len; i++) {
    var rawValue = rowData[i];
    var field = this.fields[i];
    var fieldType = field.dataTypeID;
    var parsedValue = null;
    if(rawValue !== null) {
      parsedValue = this._parsers[i](rawValue);
    }
    var fieldName = field.name;
    row[fieldName] = parsedValue;
  }
  return row;
};

Result.prototype.addRow = function(row) {
  this.rows.push(row);
};

Result.prototype.addFields = function(fieldDescriptions) {
  //clears field definitions
  //multiple query statements in 1 action can result in multiple sets
  //of rowDescriptions...eg: 'select NOW(); select 1::int;'
  //you need to reset the fields
  if(this.fields.length) {
    this.fields = [];
    this._parsers = [];
  }
  for(var i = 0; i < fieldDescriptions.length; i++) {
    var desc = fieldDescriptions[i];
    this.fields.push(desc);
    this._parsers.push(types.getTypeParser(desc.dataTypeID, desc.format || 'text'));
  }
};

module.exports = Result;

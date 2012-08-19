//result object returned from query
//in the 'end' event and also
//passed as second argument to provided callback
var Result = function() {
	Array.call(this);
	// Define properties specific to this result
	for (var prop in ['command', 'rowCount', 'oid']) {
		Object.defineProperty(this, prop, { enumerable: false, writable: true })
	}
}

Result.prototype.__proto__ = Array.prototype;

var matchRegexp = /([A-Za-z]+) (\d+ )?(\d+)?/

// Define properties that can safely exist on the prototype.
Object.defineProperties(Result.prototype, {
	rows: {
		get: function () { return this },
		enumerable: false
	},
	//adds a command complete message
	addCommandComplete: {
		value: function addCommandComplete (msg) {
			var match = matchRegexp.exec(msg.text);
			if(match) {
				this.command = match[1];
				//match 3 will only be existing on insert commands
				if(match[3]) {
					this.rowCount = parseInt(match[3]);
					this.oid = parseInt(match[2]);
				} else {
					this.rowCount = parseInt(match[2]);
				}
			}
		},
		enumerable: false
	},
	addRow: {
		value: function (row) { this.push(row) },
		enumerable: false
	}
})

module.exports = Result;

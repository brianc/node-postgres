function ArrayParser(source, converter) {
  this.source = source;
  this.converter = converter;
  this.pos = 0;
  this.entries = [];
  this.recorded = [];
  this.dimension = 0;
  if (!this.converter) {
    this.converter = function(entry) {
      return entry;
    };
  }
}

ArrayParser.prototype.eof = function() {
  return this.pos >= this.source.length;
};

ArrayParser.prototype.nextChar = function() {
  var c;
  if ((c = this.source[this.pos++]) === "\\") {
    return {
      char: this.source[this.pos++],
      escaped: true
    };
  } else {
    return {
      char: c,
      escaped: false
    };
  }
};

ArrayParser.prototype.record = function(c) {
  return this.recorded.push(c);
};

ArrayParser.prototype.newEntry = function(includeEmpty) {
  var entry;
  if (this.recorded.length > 0 || includeEmpty) {
    entry = this.recorded.join("");
    if (entry === "NULL" && !includeEmpty) {
      entry = null;
    }
    if (entry !== null) {
      entry = this.converter(entry);
    }
    this.entries.push(entry);
    this.recorded = [];
  }
};

ArrayParser.prototype.parse = function(nested) {
  var c, p, quote;
  if (nested === null) {
    nested = false;
  }
  quote = false;
  while (!this.eof()) {
    c = this.nextChar();
    if (c.char === "{" && !quote) {
      this.dimension++;
      if (this.dimension > 1) {
        p = new ArrayParser(this.source.substr(this.pos - 1), this.converter);
        this.entries.push(p.parse(true));
        this.pos += p.pos - 2;
      }
    } else if (c.char === "}" && !quote) {
      this.dimension--;
      if (this.dimension === 0) {
        this.newEntry();
        if (nested) {
          return this.entries;
        }
      }
    } else if (c.char === '"' && !c.escaped) {
      if (quote) {
        this.newEntry(true);
      }
      quote = !quote;
    } else if (c.char === ',' && !quote) {
      this.newEntry();
    } else {
      this.record(c.char);
    }
  }
  if (this.dimension !== 0) {
    throw "array dimension not balanced";
  }
  return this.entries;
};

module.exports = {
  create: function(source, converter){
    return new ArrayParser(source, converter);
  }
};

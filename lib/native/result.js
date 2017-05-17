/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var NativeResult = module.exports = function(pq) {
  this.command = null;
  this.rowCount = 0;
  this.rows = null;
  this.fields = null;
};

NativeResult.prototype.addCommandComplete = function(pq) {
  this.command = pq.cmdStatus().split(' ')[0];
  this.rowCount = parseInt(pq.cmdTuples(), 10);
  var nfields = pq.nfields();
  if(nfields < 1) return;

  this.fields = [];
  for(var i = 0; i < nfields; i++) {
    this.fields.push({
      name: pq.fname(i),
      dataTypeID: pq.ftype(i)
    });
  }
};

NativeResult.prototype.addRow = function(row) {
  // This is empty to ensure pg code doesn't break when switching to pg-native
  // pg-native loads all rows into the final result object by default.
  // This is because libpg loads all rows into memory before passing the result
  // to pg-native.
};

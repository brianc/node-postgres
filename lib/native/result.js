var NativeResult = module.exports = function(pq) {
  this.command = null;
  this.rowCount = 0;
  this.rows = null;
  this.fields = null;
};

NativeResult.prototype.addCommandComplete = function(pq) {
  this.command = pq.cmdStatus().split(' ')[0];
  this.rowCount = pq.cmdTuples();
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


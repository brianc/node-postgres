var textParsers = require(__dirname + '/textParsers');
var binaryParsers = require(__dirname + '/binaryParsers');

var typeParsers = {
  text: {},
  binary: {}
};

//the empty parse function
var noParse = function(val) {
  return String(val);
};

// returns a type name for a type oid
var getTypeName = function(oid) {
 // extracted with:
 // select '''' || oid || ''': ' || '''' || typname || ''',' from pg_type where oid < 2048 order by oid;
  var typeNames = {
 '16': 'bool',
 '17': 'bytea',
 '18': 'char',
 '19': 'name',
 '20': 'int8',
 '21': 'int2',
 '22': 'int2vector',
 '23': 'int4',
 '24': 'regproc',
 '25': 'text',
 '26': 'oid',
 '27': 'tid',
 '28': 'xid',
 '29': 'cid',
 '30': 'oidvector',
 '71': 'pg_type',
 '75': 'pg_attribute',
 '81': 'pg_proc',
 '83': 'pg_class',
 '142': 'xml',
 '143': '_xml',
 '194': 'pg_node_tree',
 '210': 'smgr',
 '600': 'point',
 '601': 'lseg',
 '602': 'path',
 '603': 'box',
 '604': 'polygon',
 '628': 'line',
 '629': '_line',
 '650': 'cidr',
 '651': '_cidr',
 '700': 'float4',
 '701': 'float8',
 '702': 'abstime',
 '703': 'reltime',
 '704': 'tinterval',
 '705': 'unknown',
 '718': 'circle',
 '719': '_circle',
 '790': 'money',
 '791': '_money',
 '829': 'macaddr',
 '869': 'inet',
 '1000': '_bool',
 '1001': '_bytea',
 '1002': '_char',
 '1003': '_name',
 '1005': '_int2',
 '1006': '_int2vector',
 '1007': '_int4',
 '1008': '_regproc',
 '1009': '_text',
 '1010': '_tid',
 '1011': '_xid',
 '1012': '_cid',
 '1013': '_oidvector',
 '1014': '_bpchar',
 '1015': '_varchar',
 '1016': '_int8',
 '1017': '_point',
 '1018': '_lseg',
 '1019': '_path',
 '1020': '_box',
 '1021': '_float4',
 '1022': '_float8',
 '1023': '_abstime',
 '1024': '_reltime',
 '1025': '_tinterval',
 '1027': '_polygon',
 '1028': '_oid',
 '1033': 'aclitem',
 '1034': '_aclitem',
 '1040': '_macaddr',
 '1041': '_inet',
 '1042': 'bpchar',
 '1043': 'varchar',
 '1082': 'date',
 '1083': 'time',
 '1114': 'timestamp',
 '1115': '_timestamp',
 '1182': '_date',
 '1183': '_time',
 '1184': 'timestamptz',
 '1185': '_timestamptz',
 '1186': 'interval',
 '1187': '_interval',
 '1231': '_numeric',
 '1248': 'pg_database',
 '1263': '_cstring',
 '1266': 'timetz',
 '1270': '_timetz',
 '1560': 'bit',
 '1561': '_bit',
 '1562': 'varbit',
 '1563': '_varbit',
 '1700': 'numeric',
 '1790': 'refcursor'
  };
  if ( typeNames[oid] ) return typeNames[oid];
  return oid;
};

//returns a function used to convert a specific type (specified by
//oid) into a result javascript type
var getTypeParser = function(oid, format) {
  if (!typeParsers[format]) {
    return noParse;
  }

  return typeParsers[format][oid] || noParse;
};

var setTypeParser = function(oid, format, parseFn) {
  if(typeof format == 'function') {
    parseFn = format;
    format = 'text';
  }
  typeParsers[format][oid] = parseFn;
};

textParsers.init(function(oid, converter) {
  typeParsers.text[oid] = function(value) {
    return converter(String(value));
  };
});

binaryParsers.init(function(oid, converter) {
  typeParsers.binary[oid] = converter;
});

module.exports = {
  getTypeParser: getTypeParser,
  setTypeParser: setTypeParser,
  getTypeName: getTypeName
};

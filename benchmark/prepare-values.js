var utils = require("../lib/utils");

var numArr = [];
for (var i = 0; i < 1000; i++) numArr[i] = i;
console.time("prepare-number-array");
for (var i = 0; i < 100; i++) {
  utils.prepareValue(numArr);
}
console.timeEnd("prepare-number-array");


var strArr = new Array(10000);
console.time("prepare-string-array");
for (var i = 0; i < 100; i++) {
  utils.prepareValue(strArr);
}
console.timeEnd("prepare-string-array");


var objArr = [];
for (var i = 0; i < 1000; i++) objArr[i] = { x: { y: 42 }};
console.time("prepare-object-array");
for (var i = 0; i < 100; i++) {
  utils.prepareValue(objArr);
}
console.timeEnd("prepare-object-array");


var obj = { x: { y: 42 }};
console.time("prepare-object");
for (var i = 0; i < 100000; i++) {
  utils.prepareValue(obj);
}
console.timeEnd("prepare-object");


var customType = {
  toPostgres: function () {
    return { toPostgres: function () { return new Date(); } };
  }
};
console.time("prepare-custom-type");
for (var i = 0; i < 100000; i++) {
  utils.prepareValue(customType);
}
console.timeEnd("prepare-custom-type");

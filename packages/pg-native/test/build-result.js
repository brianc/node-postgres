const assert = require('assert')
const types = require('pg-types')
const buildResult = require('../lib/build-result')

// the rows ('brian', 30) and ('', NULL) as libpq returns them
function fakeResult() {
  const values = [
    ['brian', '30'],
    ['', null],
  ]
  return {
    cmdStatus: () => 'SELECT 2',
    cmdTuples: () => '2',
    ntuples: () => values.length,
    nfields: () => 2,
    fname: (col) => ['name', 'age'][col],
    ftype: (col) => [25, 23][col],
    getvalue: (row, col) => values[row][col] ?? '',
    getisnull: (row, col) => values[row][col] === null,
    getvalues: () => values.flat(),
  }
}

describe('build result', function () {
  it('reads all the values in one call when libpq has getvalues', function () {
    const pq = fakeResult()
    pq.getvalue = pq.getisnull = () => {
      throw new Error('one native call per value')
    }
    assert.deepStrictEqual(buildResult(pq, types, false).rows, [
      { name: 'brian', age: 30 },
      { name: '', age: null },
    ])
    assert.deepStrictEqual(buildResult(pq, types, true).rows, [
      ['brian', 30],
      ['', null],
    ])
  })

  it('reads one value at a time with an older libpq', function () {
    const pq = fakeResult()
    delete pq.getvalues
    assert.deepStrictEqual(buildResult(pq, types, false).rows, [
      { name: 'brian', age: 30 },
      { name: '', age: null },
    ])
    assert.deepStrictEqual(buildResult(pq, types, true).rows, [
      ['brian', 30],
      ['', null],
    ])
  })
})

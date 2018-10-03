'use strict'

const helper = require('./test-helper')
const pg = helper.pg

const suite = new helper.Suite()
const Query = helper.pg.Query

const queryCanceledErrorCode = 57014;

suite.test('cancel query interface', () => {
  const client = new pg.Client()
  return client.connect()
    .then(() => {
      const promise1 = new Promise(function(resolve, reject) {
        const query1 = client.query(new Query('select pg_sleep(1) as sleep1'))
        query1.on('row', function (row, result) {
          assert(false)
          reject();
        })
        query1.on('end', (err) => {
          assert(false)
          reject();
        })
        query1.on('error', (err) => {
          assert.equal(err.code, queryCanceledErrorCode);
          resolve();
        })
        query1.cancel();
      })

      const promise2a = new Promise(function(resolve, reject) {
        const query2a = client.query(new Query('select pg_sleep(2) as sleep2'))
        query2a.on('row', function (row, result) {
          assert(false)
          reject();
        })
        query2a.on('end', (err) => {
          assert(false)
          reject();
        })
        // when canceling, this one is queued
        // we wont receive the query_canceled message from postgres
        // we check that the query is not processed, and resolve the promise after 3s
        query2a.cancel();
        setTimeout(resolve, 3000);
      });

      const promise2b = new Promise(function(resolve, reject) {
        const query2b = client.query(new Query('select pg_sleep(2) as sleep2'))
        query2b.on('row', function (row, result) {
          assert(false)
          reject();
        })
        query2b.on('end', (err) => {
          assert(false)
          reject();
        })
        query2b.on('error', (err) => {
          assert.equal(err.code, queryCanceledErrorCode);
          resolve();
        })
        // this one will be queued first, then processed when query1 is cancelled
        // we wait 1s to test the cancellation
        setTimeout(query2b.cancel.bind(query2b), 1000);
      });

      return Promise.all([promise1, promise2a, promise2b]).then(() => {
        return client.end().then(() => { });
      });
    })
})

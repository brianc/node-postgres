'use strict'
var args = require('../test/cli')
var pg = require('../lib')

var people = [
  { name: 'Aaron', age: 10 },
  { name: 'Brian', age: 20 },
  { name: 'Chris', age: 30 },
  { name: 'David', age: 40 },
  { name: 'Elvis', age: 50 },
  { name: 'Frank', age: 60 },
  { name: 'Grace', age: 70 },
  { name: 'Haley', age: 80 },
  { name: 'Irma', age: 90 },
  { name: 'Jenny', age: 100 },
  { name: 'Kevin', age: 110 },
  { name: 'Larry', age: 120 },
  { name: 'Michelle', age: 130 },
  { name: 'Nancy', age: 140 },
  { name: 'Olivia', age: 150 },
  { name: 'Peter', age: 160 },
  { name: 'Quinn', age: 170 },
  { name: 'Ronda', age: 180 },
  { name: 'Shelley', age: 190 },
  { name: 'Tobias', age: 200 },
  { name: 'Uma', age: 210 },
  { name: 'Veena', age: 220 },
  { name: 'Wanda', age: 230 },
  { name: 'Xavier', age: 240 },
  { name: 'Yoyo', age: 250 },
  { name: 'Zanzabar', age: 260 },
]

async function run() {
  var con = new pg.Client({
    user: args.user,
    password: args.password,
    host: args.host,
    port: args.port,
    database: args.database,
  })
  console.log('creating test dataset')
  await con.connect()
  await con.query('DROP TABLE IF EXISTS person')
  await con.query('CREATE TABLE person (id serial, name varchar(10), age integer)')
  await con.query(
    'INSERT INTO person (name, age) VALUES' + people.map((person) => ` ('${person.name}', ${person.age})`).join(',')
  )
  await con.end()
  console.log('created test dataset')
}

run().catch((e) => {
  console.log('setup failed', e)
  process.exit(255)
})

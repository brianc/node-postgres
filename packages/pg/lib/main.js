'use strict'
const WebSocket = require('websocket-stream');
const Client = require('./client')
var Connection = require('./connection')

var stream = WebSocket('ws://localhost:5901')
var con = new Connection({ stream: stream })
const client = new Client({
    connection: con, 
    user: 'postgres',
    host: 'localhost',
    password: 'password',
    database: 'dvdrental',
})
client.connect()
client
    .query('SELECT first_name FROM customer LIMIT 10')
    .then(res => {
        console.log(res.rows)
        client.end()
    })
    .catch(e => console.error(e.stack))

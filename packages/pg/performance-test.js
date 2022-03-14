// Runs a select statement on 10000 rows, compare performance between node pg and pg-browser
var time_pg
var time_ws

// with pg-browser
var { Client, Pool } = require("./lib/index.js")
var start = new Date().getTime();

var client = new Client({
    database: 'postgres',
    user: 'bitdotio-2',
    password: 'password',
    port: '5901',
})

client.connect(() => {
    client.query("SELECT * FROM generate_series(1,10000)", () => {
        var elapsed = new Date().getTime() - start;
        time_ws = elapsed
        console.log("Ws time: %d", time_ws)
        client.end(() => {
            // with regular pg
            var { Client, Pool } = require('pg')
            var start = new Date().getTime();
    
            client = new Client({
                database: 'postgres',
                user: 'bitdotio-2',
                password: 'password',
                port: '5433',
            })
    
            client.connect(() => {
                client.query("SELECT * FROM generate_series(1,10000)", () => {
                    var elapsed = new Date().getTime() - start;
                    time_pg = elapsed
                    console.log("Vanilla pg time: %d", time_pg)
                    client.end()
                })
            })
        })
    })
})






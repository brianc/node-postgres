const { Client } = require('pg')
const Cursor = require('pg-cursor')

const client = new Client({
    database: 'postgres',
    user: 'bitdotio-2',
    password: 'password',
    port: '5433',
})

client.connect()

const cursor = client.query(new Cursor("SELECT * FROM generate_series(1,100)"))
// read partially from cursor
cursor.read(1, () => {
    console.log("Cursor read")
    // send query from client, which will not execute since there is a PortalSuspended
    client.query("SELECT 1", () => {
        console.log("SELECT 1")
        cursor.read(100, () => {
            console.log("Cursor read again")
        })
    })
    // if calling client.connection.query() or cursor.connection.query()
    // instead, the portal will receive a commandComplete and then close
})
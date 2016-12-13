var pg = require('../lib/index.js');


var config = {
    host: 'localhost',
    user: 'postgres', //env var: PGUSER
    database: 'postgres', //env var: PGDATABASE
    password: null, //env var: PGPASSWORD
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
    multipleStatementResult : true
};

var client = new pg.Client(config);

// connect to our database
client.connect(function (err) {
    if (err) throw err;

    // execute a query on our database
    client.query('DELETE FROM users WHERE id = 1;SELECT * FROM users;select * from events;update users set id = 1 where id = 1; INSERT INTO users(id,email,name) values(332,\'email@example.com\',\'test user\');', function (err, result) {
        if (err) throw err;

        // just print the result to the console
        console.log(result.rows[0]);

        // disconnect the client
        client.end(function (err) {
            if (err) throw err;
        });
    });
});
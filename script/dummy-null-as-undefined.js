// process.env.NODE_PG_FORCE_NATIVE = 1; // todo node-pg-native should have similar api

const {Pool} = require('../lib/');
const Connection = require('../lib/connection');
Connection.nullValue = undefined;

const pool = new Pool();

pool.query(`WITH test AS (
	SELECT * FROM (VALUES ('u1', 'user1'), ('u2', ''), ('u3', NULL)) AS account (id, name)
)
SELECT * FROM test
`).then(({rows}) => console.log(JSON.stringify(rows)));

// [{"id":"u1","name":"user1"},{"id":"u2","name":""},{"id":"u3"}]
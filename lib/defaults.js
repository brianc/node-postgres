module.exports = {
  //database user's name
  user: process.env.USER,

  //name of database to connect
  database: process.env.USER,

  //database user's password
  password: null,
  
  //database port
  port: 5432,

  //number of rows to return at a time from a prepared statement's
  //portal. 0 will return all rows at once
  rows: 0,
  
  //number of connections to use in connection pool
  //0 will disable connection pooling
  poolSize: 10,

  //max milliseconds a client can go unused before it is removed
  //from the pool and destroyed
  poolIdleTimeout: 30000,

  //frequeny to check for idle clients within the client pool
  reapIntervalMillis: 1000,

  // binary result mode
  binary: false
}

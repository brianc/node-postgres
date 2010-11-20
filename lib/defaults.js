module.exports = {
  //database user's name
  user: '',
  //name of database to connect
  database: '',
  //database user's password
  password: '',
  //database port
  port: 5432,
  //number of rows to return at a time from a prepared statement's
  //portal. 0 will return all rows at once
  rows: 0,
  //number of connections to use in connection pool
  //0 will disable connection pooling
  poolSize: 10
}

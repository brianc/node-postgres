var config = {};
var sys = require('sys');
var args = process.argv;
for(var i = 0; i < args.length; i++) {
  switch(args[i].toLowerCase()) {
  case '-u':
  case '--user':
    config.user = args[++i];
    break;
  case '--password':
    config.password = args[++i];
    throw new Error("Passwords not supported yet");
    break;
  case '-d':
  case '--database':
    config.database = args[++i];
    break;
  case '-p':
  case '--port':
    config.port = args[++i];
    break;
  case '-h':
  case '--host':
    config.host = args[++i];
    break;
  case '--down':
    config.down = true;
    break;
  default:
    break;
  }
}
var log = function(keys) {
  keys.forEach(function(key) {
    console.log(key + ": '" + config[key] + "'");
  });
}
log(['user','password','database','port','host'])

var pg = require(__dirname + '/../lib');
var con = new pg.Connection();
var people
con.connect(config.port, config.host);
con.on('connect', function() {
  console.log('connected');
  con.startup({
    user: config.user,
    database: config.database
  });
  con.once('readyForQuery', function() {
    config.down===true ? dropTable(con) : createTable(con);
  });
});

var people = [
  {name: 'Aaron',    age: 10},
  {name: 'Brian',    age: 20},
  {name: 'Chris',    age: 30},
  {name: 'David',    age: 40},
  {name: 'Elvis',    age: 50},
  {name: 'Frank',    age: 60},
  {name: 'Grace',    age: 70},
  {name: 'Haley',    age: 80},
  {name: 'Irma',     age: 90},
  {name: 'Jenny',    age: 100},
  {name: 'Kevin',    age: 110},
  {name: 'Larry',    age: 120},
  {name: 'Michelle', age: 130},
  {name: 'Nancy',    age: 140},
  {name: 'Olivia',   age: 150},
  {name: 'Peter',    age: 160},
  {name: 'Quinn',    age: 170},
  {name: 'Ronda',    age: 180},
  {name: 'Shelley',  age: 190},
  {name: 'Tobias',   age: 200},
  {name: 'Uma',      age: 210},
  {name: 'Veena',    age: 220},
  {name: 'Wanda',    age: 230},
  {name: 'Xavier',   age: 240},
  {name: 'Yoyo',     age: 250},
  {name: 'Zanzabar', age: 260}
]

var makeInsert = function(person) {
  return "insert into person(name, age) values('"+person.name + "', '" + person.age + "')";
};
var personIndex = 0;
var createTable = function(con) {
  console.log("creating table 'person'");
  con.query('create table person (id serial, name varchar(30), age integer)');
  con.once('readyForQuery', function() {
    console.log('created person table');
    insertPerson(con);
  });
};

var insertPerson = function(con) {
  if(personIndex < people.length) {
    var query = makeInsert(people[personIndex++]);
    con.query(query);
    con.once('readyForQuery', function() {
      insertPerson(con);
    });
  }
  else {
    con.query("select * from person");
    con.on('dataRow', function(row) {
      console.log(row.fields);
    });
    con.once('readyForQuery', function() {
      con.end();
    });
  }
};

var dropTable = function(con){
  console.log("dropping table 'person'");
  con.query('drop table person');
  con.once('readyForQuery', function() {
    console.log("dropped table 'person'");
    con.end();
  });
}

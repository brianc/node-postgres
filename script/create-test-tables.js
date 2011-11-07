var args = require(__dirname + '/../test/cli');
var pg = require(__dirname + '/../lib');

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

var con = new pg.Client({
  host: args.host,
  port: args.port,
  user: args.user,
  password: args.password,
  database: args.database
});
con.connect();
if(args.down) {
  console.log("Dropping table 'person'")
  var query = con.query("drop table person");
  query.on('end', function() {
    console.log("Dropped!");
    con.end();
  });
} else {
  console.log("Creating table 'person'");
  con.query("create table person(id serial, name varchar(10), age integer)").on('end', function(){
    console.log("Created!");
    console.log("Filling it with people");
  });;
  people.map(function(person) {
    return con.query("insert into person(name, age) values('"+person.name + "', '" + person.age + "')");
  }).pop().on('end', function(){
    console.log("Inserted 26 people");
    con.end();
  });
}

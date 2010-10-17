#pg.js
Pure JavaScript PostgreSQL driver for node.js

## ALPHA version

Unlike many githubbers this is my only active project.  All my
free coding time is to be going towards this until it's production
ready and stable so watch the repo and stay tuned.

### What works?

    var client = new Client({
      username: 'brianc',
      database: 'postgres'
    });

    client.connect();
    
    client.query('select typname, oid from pg_type');

    query.on('row', function(row) {
      console.log('type name: ' + row[0] + ' oid: ' + row[1]);      
    };

    query.on('end') {
      client.disconnect();
    };

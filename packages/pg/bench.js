const pg = require("./lib");
const pool = new pg.Pool()

const q = {
  text:
    "select typname, typnamespace, typowner, typlen, typbyval, typcategory, typispreferred, typisdefined, typdelim, typrelid, typelem, typarray from pg_type where typtypmod = $1 and typisdefined = $2",
  values: [-1, true]
};

const exec = async client => {
  const result = await client.query({
    text: q.text,
    values: q.values,
    rowMode: "array"
  });
};

const bench = async (client, time) => {
  let start = Date.now();
  let count = 0;
  while (true) {
    await exec(client);
    count++;
    if (Date.now() - start > time) {
      return count;
    }
  }
};

const run = async () => {
  const client = new pg.Client();
  await client.connect();
  await bench(client, 1000);
  console.log("warmup done");
  const seconds = 5;
  const queries = await bench(client, seconds * 1000);
  console.log("queries:", queries);
  console.log("qps", queries / seconds);
  await client.end();
};

run().catch(e => console.error(e) || process.exit(-1));

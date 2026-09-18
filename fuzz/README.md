# Fuzzing

Three differential fuzzers. Each draws random cases from a seed, runs them two ways that must
agree, and on a divergence prints the seed that reproduces it and the case shrunk to the lines
worth pasting into a test. The CI runs a few hundred rounds of each on a seed nobody chose, on
every push and pull request.

| Tool | Arms | Needs a server |
| --- | --- | --- |
| `node fuzz/wire.js` | the pg-protocol parser on random backend messages, in one buffer and cut at random points, against what was written | no |
| `node fuzz/modes.js` | `client.query` against the extended protocol forced, a named statement run twice, rowMode array, the binary result format, pipeline mode, pg-cursor and pg-query-stream | yes, `PG*` variables |
| `node fuzz/native.js` | pg against pg-native, as a plain query, a named statement and rowMode array | yes, and pg-native built |

```bash
node fuzz/modes.js --rounds 200        # longer
node fuzz/modes.js --seed 12345 --rounds 1   # replay what a past run printed
node fuzz/modes.js --keep-going        # do not stop at the first divergence
node fuzz/modes.js --no-shrink         # print the round as drawn
```

The queries come from `queries.js`: selects over `generate_series` with a column per type family,
sometimes as a parameter instead of a literal, writes on a temp table, and statements that fail
on purpose, some of them only after rows were sent. What the binary arm can compare is limited to
the types pg-types has a binary parser for, the `binary` flag of each type says which. The native
arm draws no Buffer parameter: pg-native hands it to libpq as a C string, cut at its first zero
byte (#980), and the fix for that is in node-libpq.

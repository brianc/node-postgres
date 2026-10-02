# Benchmark

A/B of two checkouts of this repo against the same database: the `pg`, `pg-pool`, `pg-cursor` and
`pg-query-stream` of `--head` over the same packages of `--base`, scenario by scenario. The CI runs
it on every pull request with the base branch in `--base` and the PR in `--head`, over a unix
socket, and posts the table as a comment on the PR.

Both checkouts must be installed and built (`yarn install && yarn build`). The database comes from
the usual `PG*` environment variables.

```bash
yarn benchmark --base ../node-postgres-master --head . --rounds 4 --duration 3
```

Both arms stay up in their own process and the load alternates between them one scenario at a
time, swapping which goes first on every round, so the two measurements behind a ratio are seconds
apart and a drift of the machine lands on both. Only the ratio is comparable across runs: the
absolute queries per second depend on the machine.

The scenarios cover the row parser on every family of type, the parameter encoding on writes,
prepared and unnamed statements, array and binary result modes, transactions, the pool, cursors,
streams and pipeline mode. Each scenario is one iteration of a function in `worker.js`, which
returns how many queries it ran.

# Real GSS authentication checks

These opt-in checks use a disposable PostgreSQL server and MIT Kerberos KDC.
They generate their own identities, keys and TLS certificates. No production
database, domain configuration, ticket cache or server policy is changed.

`run-real-checks.js` compares the unmodified source mounted at `/before-source`
with the candidate mounted at `/source`. It verifies ticket authentication,
verified TLS, pool reuse, a real SSH tunnel with the database service hostname,
and clean failure for missing/expired tickets, invalid service names, rejected
identities, invalid CA trust and required GSS encryption. A libpq control must
authenticate before the comparisons run.

Example:

```sh
docker build -t pg-gss-fixture packages/pg/test/integration/gss
docker run --name pg-gss-fixture \
  -e NPM_CONFIG_REGISTRY="$NPM_CONFIG_REGISTRY" \
  -v "$PWD:/source:ro" \
  -v "$BASELINE_SOURCE:/before-source:ro" \
  pg-gss-fixture \
  bash -c '/source/packages/pg/test/integration/gss/prepare.sh && /work/current/packages/pg/test/integration/gss/run-fixture.sh'
docker cp pg-gss-fixture:/work/real-authentication-results.json .
docker rm pg-gss-fixture
```

Set `NPM_CONFIG_REGISTRY` to the package registry approved for your environment.
The container must be able to download packages and Node build headers while
preparing; authentication servers subsequently bind only to container loopback.
No host ports are published. Use a unique container name when another run exists.

The generated result records actual outcomes, not an assertion that every
platform works. This Linux fixture does not validate Windows SSPI or Windows
domain Kerberos. Those require separate platform fixtures and results.

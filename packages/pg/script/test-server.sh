#!/bin/bash
# Runs a PostgreSQL server for the integration tests in a container, using the same image
# as .github/workflows/ci.yml. That image has SSL configured, which the official
# PostgreSQL images do not, and without it the SCRAM channel binding tests cannot run.
# Works with either podman or docker.
#
#   packages/pg/script/test-server.sh        # start it, and print the environment to export
#   packages/pg/script/test-server.sh stop   # remove it again
#
# POSTGRES_VERSION, PORT, NAME, IMAGE and CONTAINER_ENGINE can each be overridden.
set -euo pipefail

ENGINE=${CONTAINER_ENGINE:-}
if [ -z "$ENGINE" ]; then
  for candidate in podman docker; do
    if command -v "$candidate" >/dev/null; then
      ENGINE=$candidate
      break
    fi
  done
fi
if [ -z "$ENGINE" ]; then
  echo "Neither podman nor docker was found. Set CONTAINER_ENGINE to the one to use." >&2
  exit 1
fi

NAME=${NAME:-node-postgres-test}
PORT=${PORT:-5432}
POSTGRES_VERSION=${POSTGRES_VERSION:-18}
IMAGE=${IMAGE:-ghcr.io/railwayapp-templates/postgres-ssl:$POSTGRES_VERSION}

if [ "${1:-start}" = stop ]; then
  exec "$ENGINE" rm -f "$NAME"
fi

"$ENGINE" rm -f "$NAME" >/dev/null 2>&1 || true

# PGDATA is pinned because the PostgreSQL 18 image defaults it to a versioned
# subdirectory, which this image's entrypoint rejects. See the same note in ci.yml.
"$ENGINE" run -d --name "$NAME" -p "$PORT:5432" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_HOST_AUTH_METHOD=md5 \
  -e POSTGRES_DB=ci_db_test \
  -e PGDATA=/var/lib/postgresql/data \
  "$IMAGE" >/dev/null

printf 'waiting for %s' "$NAME"
for _ in $(seq 1 60); do
  if "$ENGINE" exec "$NAME" pg_isready -q 2>/dev/null; then break; fi
  printf .
  sleep 1
done
echo

# The roles the SCRAM tests look for, as ci.yml creates them. Their passwords are stored
# using scram-sha-256 whatever the server's own default is, so that the server offers
# SCRAM-SHA-256-PLUS once SSL is in use.
"$ENGINE" exec -i "$NAME" psql -U postgres -d ci_db_test -v ON_ERROR_STOP=1 -q <<'SQL'
SET password_encryption = 'scram-sha-256';
CREATE ROLE scram_test LOGIN PASSWORD 'test4scram';
CREATE ROLE scram_unicode_test LOGIN PASSWORD U&'IX-\2168';
SQL

"$ENGINE" exec "$NAME" psql -U postgres -d ci_db_test -tAc \
  "select version() || ', ssl=' || current_setting('ssl')"

cat <<ENV

Export these, then run 'make test-integration' (or 'make test-all') from packages/pg:

export PGHOST=localhost PGPORT=$PORT PGUSER=postgres PGPASSWORD=postgres PGDATABASE=ci_db_test
export SCRAM_TEST_PGUSER=scram_test SCRAM_TEST_PGPASSWORD=test4scram
export SCRAM_TEST_PGHOST=localhost SCRAM_TEST_PGPORT=$PORT SCRAM_TEST_PGDATABASE=ci_db_test
export SCRAM_TEST_PGUSER_UNICODE=scram_unicode_test SCRAM_TEST_PGPASSWORD_UNICODE=\$'IX-\\u2168'
unset PGTESTNOSSL
ENV

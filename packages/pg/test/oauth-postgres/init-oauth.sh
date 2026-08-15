#!/bin/sh
set -eu

cat >> "$PGDATA/postgresql.conf" <<'EOF'
oauth_validator_libraries = 'oauth_validator'
EOF

cat > "$PGDATA/pg_hba.conf" <<'EOF'
local all all trust
hostssl all all all oauth issuer="https://issuer.example" scope="postgres"
EOF

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE oauth_test LOGIN;
SQL

# Local development

Steps to set up and run node-postgres locally.

## Prerequisites

- **Node.js** ≥ 22.11.0 (LTS)
- **pnpm** ≥ 10 — install via `corepack enable`
- **PostgreSQL** ≥ 14, with SSL enabled (for the integration tests)
- _(optional)_ `libpq` system headers — only required to build `pg-native` (macOS: `brew install libpq`; Debian: `apt install libpq-dev`)

## Repo setup

```sh
corepack enable
pnpm install
pnpm build
pnpm test
```

Per-package commands:

```sh
pnpm --filter pg test
pnpm --filter pg-pool test
pnpm --filter pg-protocol test
# etc.
```

## Postgres on macOS (Homebrew)

1. Install Postgres: `brew install postgresql`
2. Create the test database: `createdb test`
3. Create SSL certificates:
   ```sh
   cd /opt/homebrew/var/postgresql@14
   openssl genrsa -aes128 2048 > server.key
   openssl rsa -in server.key -out server.key
   chmod 400 server.key
   openssl req -new -key server.key -days 365 -out server.crt -x509
   cp server.crt root.crt
   ```
4. Update `/opt/homebrew/var/postgresql@14/postgresql.conf`:
   ```conf
   listen_addresses = '*'
   password_encryption = md5
   ssl = on
   ssl_ca_file = 'root.crt'
   ssl_cert_file = 'server.crt'
   ssl_crl_file = ''
   ssl_crl_dir = ''
   ssl_key_file = 'server.key'
   ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
   ssl_prefer_server_ciphers = on
   ```
5. Start Postgres:
   ```sh
   /opt/homebrew/opt/postgresql@14/bin/postgres -D /opt/homebrew/var/postgresql@14
   ```

## Environment variables for tests

```sh
export PGUSER=postgres
export PGPASSWORD=postgres
export PGHOST=localhost
export PGDATABASE=ci_db_test
export PGTESTNOSSL=1   # skip SSL tests if you don't want to set up certs
```

## Tooling

- **Build:** `obuild` — runs `obuild` per package, transforms `src/` → `dist/`
- **Lint:** `oxlint` + `oxfmt` (Rust-based, fast)
- **Typecheck:** `tsgo --noEmit` (`@typescript/native-preview`, Rust-based TypeScript)
- **Test:** `vitest`
- **Versioning:** `bumpp -r` (recursive across workspace packages)

# node-postgres

PostgreSQL client for Node.js. Pure TypeScript, ESM-only, monorepo of focused packages.

> [!IMPORTANT]
> Keep `AGENTS.md` updated with project status.

## Architecture

The codebase is split into small, single-purpose packages that compose into a full Postgres client:

```
User Code
  │
  ├─ pg                   ← high-level Client / Pool / Query API
  │    ├─ pg-pool          ← connection pooling
  │    ├─ pg-protocol      ← PostgreSQL wire protocol (binary parser/serializer)
  │    ├─ pg-connection-string  ← URI parsing
  │    └─ pg-cloudflare    ← Workers TCP socket adapter (workerd condition)
  │
  ├─ pg-cursor            ← server-side cursor on top of pg.Client
  ├─ pg-query-stream      ← Readable stream wrapper around pg-cursor
  └─ pg-native            ← optional libpq native bindings (same API)
```

## Project Structure

```
packages/
  pg/                       # Main client — Client, Pool, Query, types
    src/
      client/               # Client class + connection state machine
      connection/           # Socket + protocol bridging (Node net + tls)
      query/                # Query, prepared statements, result building
      types/                # Type parsing/encoding
      crypto/               # SCRAM, MD5 password hashing
      utils/                # Defaults, escape helpers
      index.ts              # Public exports
    test/                   # vitest, mirrors src/
  pg-pool/                  # Connection pool (single file)
  pg-protocol/              # Binary protocol parser/serializer
    src/
      buffer-reader.ts
      buffer-writer.ts
      messages.ts
      parser.ts
      serializer.ts
      index.ts
  pg-cloudflare/            # Workers TCP socket
  pg-connection-string/     # URI parser
  pg-cursor/                # Cursor extension
  pg-query-stream/          # Readable stream
  pg-native/                # libpq bindings
  pg-bundler-test/          # bundler smoke tests
  pg-esm-test/              # ESM compliance tests
docs/                       # Nextra-based docs site
```

Each package follows the same shape:

```
packages/<pkg>/
  src/
    index.ts                # public API
    *.ts                    # implementation
  test/
    *.test.ts               # vitest, flat structure
  package.json
  tsconfig.json
  build.config.ts           # obuild
  vitest.config.ts          # if package needs custom timeouts
```

## Build & Scripts

Root scripts (run from repo root):

```bash
pnpm install         # install workspace deps
pnpm build           # obuild all packages (recursive)
pnpm dev             # vitest watch (whole repo)
pnpm lint            # oxlint + oxfmt --check
pnpm lint:fix        # oxlint --fix + oxfmt
pnpm fmt             # oxfmt
pnpm typecheck       # tsgo --noEmit, all packages
pnpm test            # lint + typecheck + per-package test
pnpm test:unit       # vitest run, whole repo
pnpm release         # pnpm test && pnpm build && bumpp -r
```

Per-package scripts (from `packages/<pkg>`):

```bash
pnpm build           # obuild
pnpm typecheck       # tsgo --noEmit
pnpm test            # vitest run
```

## Code Conventions

- **Pure ESM** — `"type": "module"`, no CJS, no dual-package output
- **Node 22.11+** — `engines.node >= 22.11.0`, no polyfills
- **TypeScript strict** — `tsgo` for typecheck, `verbatimModuleSyntax`, `allowImportingTsExtensions`
- **Imports include `.ts` extension** — `import { x } from "./y.ts"` (mısına convention)
- **Formatter:** oxfmt (single quotes, no semicolons, 120 width, trailingComma es5)
- **Linter:** oxlint (unicorn, typescript, oxc plugins)
- **Tests:** vitest in `test/` directory, flat structure, `*.test.ts`
- **Exports:** explicit in `src/index.ts`, no barrel re-exports
- **Granular sub-paths** — each public entry has its own export in `package.json#exports` mapping to `.d.mts` + `.mjs`
- **Build:** obuild with `transform` mode (one `.ts` → one `.mjs` + `.d.mts`)
- **Internal files:** prefix with `_` (e.g. `_utils.ts`)
- **Commits:** semantic lowercase (`feat:`, `fix:`, `chore:`, `docs:`)
- **Issues:** reference in commits when relevant (`feat(#N):`)

## Testing

- **Framework:** vitest
- **Location:** `packages/<pkg>/test/` (mirrors src/ when grouping helps)
- **Coverage:** `@vitest/coverage-v8`
- **Integration tests** require a running Postgres instance — see `LOCAL_DEV.md`
- **Cloudflare tests** use `@cloudflare/vitest-pool-workers`
- **Native tests** require `libpq` system headers (pg-native only)
- Run all: `pnpm test`
- Run one package: `pnpm --filter pg test`
- Run one file: `pnpm vitest run packages/pg/test/<file>.test.ts`

## Migration Notes (from yarn/lerna era)

This repo was migrated from a yarn + lerna + mocha + CommonJS setup (~6 years old) to the modern ESM/TypeScript/vitest stack. The public API of each package is preserved, but consumers must use ESM-compatible imports. Major version bumps published as part of the migration.

## Runtime Targets

- **Node.js**: 22.11+ (LTS)
- **Cloudflare Workers**: via `pg-cloudflare`
- **Browser/Edge**: not a target — `pg` requires net + tls

---
title: Security Best Practices
---

# Security Best Practices

This guide covers common security pitfalls when using node-postgres and how to prevent them.

## SQL Injection Prevention

**Never** concatenate user input directly into SQL queries:

```javascript
// ❌ DANGEROUS - SQL Injection vulnerable
const query = `SELECT * FROM users WHERE id = '${userId}'`;
await pool.query(query);

// ✅ SAFE - Parameterized query
const query = 'SELECT * FROM users WHERE id = $1';
await pool.query(query, [userId]);
```

PostgreSQL's parameterized queries ensure user input is always treated as data, never as SQL code.

**CWE Reference:** [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)

## Connection Pool Management

Always release clients back to the pool. Failing to do so causes connection leaks:

```javascript
// ❌ DANGEROUS - Connection leak
const client = await pool.connect();
const result = await client.query('SELECT * FROM users');
return result.rows;
// client.release() never called!

// ✅ SAFE - Guaranteed release with try/finally
const client = await pool.connect();
try {
  const result = await client.query('SELECT * FROM users');
  return result.rows;
} finally {
  client.release();
}
```

**Tip:** Prefer `pool.query()` for single queries — it handles connection management automatically.

**CWE Reference:** [CWE-772: Missing Release of Resource after Effective Lifetime](https://cwe.mitre.org/data/definitions/772.html)

## Transaction Safety

When using transactions, always use the same client for all queries:

```javascript
// ❌ DANGEROUS - Race condition
await pool.query('BEGIN');
await pool.query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
await pool.query('COMMIT');
// Different connections may be used!

// ✅ SAFE - Single client for transaction
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - 100 WHERE id = $1', [1]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

**CWE Reference:** [CWE-362: Race Condition](https://cwe.mitre.org/data/definitions/362.html)

## COPY FROM Security

When using `COPY FROM` with file paths, validate paths to prevent directory traversal:

```javascript
// ❌ DANGEROUS - Path traversal
const userPath = req.query.path; // Could be "../../../etc/passwd"
await client.query(`COPY users FROM '${userPath}'`);

// ✅ SAFE - Use COPY FROM STDIN instead
import { pipeline } from 'stream/promises';
import { from as copyFrom } from 'pg-copy-streams';

const ingestStream = client.query(copyFrom('COPY users FROM STDIN WITH (FORMAT csv)'));
await pipeline(validatedDataStream, ingestStream);
```

**CWE Reference:** [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)

## Static Analysis Tools

Consider using ESLint plugins to catch these issues at development time:

- **[eslint-plugin-pg](https://www.npmjs.com/package/eslint-plugin-pg)** — 13 rules specifically for node-postgres security:
  - `pg/no-unsafe-query` — Detects SQL injection patterns
  - `pg/no-missing-client-release` — Catches connection leaks
  - `pg/no-transaction-on-pool` — Prevents transaction race conditions
  - `pg/no-unsafe-copy-from` — Guards against path traversal in COPY
  
  All rules include CWE identifiers and auto-fix suggestions.

```bash
npm install --save-dev eslint-plugin-pg
```

```javascript
// eslint.config.js
import pg from 'eslint-plugin-pg';
export default [pg.configs.recommended];
```

## Additional Resources

- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [PostgreSQL Security Documentation](https://www.postgresql.org/docs/current/security.html)

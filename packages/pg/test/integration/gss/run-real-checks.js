'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const cases = [
  'plain',
  'tls',
  'pool',
  'ssh',
  'ssh-without-database-host',
  'missing-ticket',
  'expired-ticket',
  'invalid-service',
  'rejected-identity',
  'invalid-ca',
  'required-encryption',
]
const results = []
for (const stage of ['before', 'after']) {
  for (const scenario of cases) {
    const clientRoot = stage === 'before' ? '/work/before/packages/pg' : '/work/current/packages/pg'
    const child = spawnSync(process.execPath, [path.join(__dirname, 'probe-real.js'), scenario], {
      env: { ...process.env, PG_GSS_CLIENT_ROOT: clientRoot },
      encoding: 'utf8',
      timeout: 12000,
    })
    let status
    let details = null
    const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length) details = JSON.parse(lines[lines.length - 1])
    if (child.error) status = 'harness-timeout-or-error'
    else if (child.status === 1 && /Unknown authenticationOk message type 7/.test(child.stderr))
      status = 'uncaught-parser-exception'
    else if (child.status === 0 && details) status = details.status
    else status = 'unexpected'
    results.push({ stage, scenario, status, exitCode: child.status, details })
    console.log(JSON.stringify(results[results.length - 1]))
  }
}
fs.writeFileSync(
  '/work/real-authentication-results.json',
  JSON.stringify(
    {
      fixture: 'disposable local PostgreSQL and MIT Kerberos',
      kerberosBinding: require('/work/deps/node_modules/kerberos').version,
      node: process.version,
      libpqControl: fs.readFileSync('/work/libpq-gss-control.txt', 'utf8').trim(),
      results,
    },
    null,
    2
  )
)
for (const result of results) {
  if (result.stage === 'after') {
    const expected = ['plain', 'tls', 'pool', 'ssh'].includes(result.scenario) ? 'connected' : 'rejected'
    assert.strictEqual(result.status, expected, `${result.stage}/${result.scenario}`)
  }
}
assert.strictEqual(
  results.find((result) => result.stage === 'before' && result.scenario === 'tls').status,
  'uncaught-parser-exception'
)
assert.strictEqual(fs.readFileSync('/work/libpq-gss-control.txt', 'utf8').trim(), 't|f')

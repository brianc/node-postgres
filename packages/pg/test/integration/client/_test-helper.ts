import helper, { assert, Client } from '../../_test-helper.ts'

export * from '../../_test-helper.ts'

// Mirrors `helper.client(cb?)` from the legacy harness — returns a connected Client.
export function client(cb?: (err?: Error | null) => void): InstanceType<typeof Client> {
  const c = new Client()
  c.connect(cb || (() => {}))
  return c
}

export function versionGTE(
  c: { query: InstanceType<typeof Client>['query'] },
  testVersion: number,
  callback: (err?: Error, ok?: boolean) => void
): void {
  c.query(
    'SHOW server_version_num',
    assert.calls((err: unknown, result: unknown) => {
      if (err) return callback(err as Error)
      const rows = (result as { rows: Array<{ server_version_num: string }> }).rows
      const version = parseInt(rows[0].server_version_num, 10)
      callback(undefined, version >= testVersion)
    })
  )
}

export default { ...helper, client, versionGTE }

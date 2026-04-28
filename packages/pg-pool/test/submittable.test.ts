import { describe, it } from 'vitest'

// The original mocha suite registered this case as pending via the rare
// `it(title, false, fn)` signature. We mirror that with `it.skip`. The body
// loads `pg-cursor` lazily via a dynamic specifier so we don't introduce a
// workspace dependency cycle (pg-cursor → pg → pg-pool) and so tsgo doesn't
// require pg-cursor's types to resolve at typecheck time.
describe('submittle', () => {
  it.skip('is returned from the query method', async () => {
    const cursorSpec = 'pg-cursor'
    const { default: Cursor } = (await import(cursorSpec)) as { default: new (sql: string) => unknown }
    const { default: Pool } = await import('../src/index.ts')
    const pool = new Pool()
    const cursor: any = pool.query(new Cursor('SELECT * from generate_series(0, 1000)') as any)
    await new Promise<void>((resolve) => {
      cursor.read((_err: Error | undefined, _rows: unknown[]) => {
        cursor.close(() => resolve())
      })
    })
  })
})

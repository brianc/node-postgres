import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time))

const childScript = fileURLToPath(new URL('./idle-timeout-exit.ts', import.meta.url))

describe('idle timeout', () => {
  it('should timeout and remove the client', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ idleTimeoutMillis: 10 })
      pool.query('SELECT NOW()')
      pool.on('remove', () => {
        expect(pool.idleCount).toBe(0)
        expect(pool.totalCount).toBe(0)
        resolve()
      })
    }))

  it('times out and removes clients when others are also removed', async () => {
    const pool = new Pool({ idleTimeoutMillis: 10 })
    const clientA = await pool.connect()
    const clientB = await pool.connect()
    clientA.release() // this will put clientA in the idle pool
    clientB.release(new Error()) // an error will cause clientB to be removed immediately

    const removal = new Promise<void>((resolve) => {
      pool.on('remove', (client: unknown) => {
        // clientB's stream may take a while to close, so we may get a remove
        // event for it
        // we only want to handle the remove event for clientA when it times out
        // due to being idle
        if (client !== clientA) {
          return
        }

        expect(pool.idleCount).toBe(0)
        expect(pool.totalCount).toBe(0)
        resolve()
      })
    })

    const timeout = wait(100).then(() => Promise.reject(new Error('Idle timeout failed to occur')))

    try {
      await Promise.race([removal, timeout])
    } finally {
      pool.end()
    }
  })

  it('can remove idle clients and recreate them', async () => {
    const pool = new Pool({ idleTimeoutMillis: 1 })
    const results: unknown[] = []
    for (let i = 0; i < 20; i++) {
      const query = pool.query('SELECT NOW()')
      expect(pool.idleCount).toBe(0)
      expect(pool.totalCount).toBe(1)
      results.push(await query)
      await wait(2)
      expect(pool.idleCount).toBe(0)
      expect(pool.totalCount).toBe(0)
    }
    expect(results).toHaveLength(20)
  })

  it('does not time out clients which are used', async () => {
    const pool = new Pool({ idleTimeoutMillis: 1 })
    const results: unknown[] = []
    for (let i = 0; i < 20; i++) {
      const client = await pool.connect()
      expect(pool.totalCount).toBe(1)
      expect(pool.idleCount).toBe(0)
      await wait(10)
      results.push(await client.query('SELECT NOW()'))
      client.release()
      expect(pool.idleCount).toBe(1)
      expect(pool.totalCount).toBe(1)
    }
    expect(results).toHaveLength(20)
    return pool.end()
  })

  it('unrefs the connections and timeouts so the program can exit when idle when the allowExitOnIdle option is set', () =>
    new Promise<void>((resolve, reject) => {
      const child = fork(childScript, [], {
        stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
        env: { ...process.env, ALLOW_EXIT_ON_IDLE: '1' },
        execArgv: ['--experimental-strip-types', '--no-warnings'],
      })
      let result = ''
      child.stdout!.setEncoding('utf8')
      child.stdout!.on('data', (chunk) => (result += chunk))
      child.on('error', (err) => reject(err))
      child.on('exit', (exitCode) => {
        expect(exitCode).toBe(0)
        expect(result).toBe('completed first\ncompleted second\n')
        resolve()
      })
    }))

  it('keeps old behavior when allowExitOnIdle option is not set', () =>
    new Promise<void>((resolve, reject) => {
      const child = fork(childScript, [], {
        stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
        execArgv: ['--experimental-strip-types', '--no-warnings'],
      })
      let result = ''
      child.stdout!.setEncoding('utf8')
      child.stdout!.on('data', (chunk) => (result += chunk))
      child.on('error', (err) => reject(err))
      child.on('exit', (exitCode) => {
        expect(exitCode).toBe(0)
        expect(result).toBe('completed first\ncompleted second\nremoved\n')
        resolve()
      })
    }))
})

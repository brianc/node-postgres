'use strict'

const assert = require('assert')
const helper = require('../test-helper')

const { Client } = helper
const { cancelQuery } = helper.pg
const suite = new helper.Suite()
let testId = 0

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function config(label) {
  testId++
  return { ...helper.config, application_name: `pg-cancel-${label}-${process.pid}-${testId}` }
}

async function waitUntilActive(observer, applicationName) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await observer.query(
      "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND state = 'active'",
      [applicationName]
    )
    if (result.rowCount === 1) {
      return
    }
    await delay(20)
  }
  throw new Error('query did not become active')
}

suite.test('cancels an active query and preserves the client for following work', async () => {
  const clientConfig = { ...config('manual'), ssl: { rejectUnauthorized: false } }
  const client = new Client(clientConfig)
  const observer = new Client(helper.config)
  await Promise.all([client.connect(), observer.connect()])

  try {
    const running = client.query('SELECT pg_sleep(30)')
    await waitUntilActive(observer, clientConfig.application_name)
    const cancellation = cancelQuery(client)

    await assert.rejects(running, (error) => error.code === '57014')
    assert.strictEqual(await cancellation, true)
    assert.strictEqual((await client.query('SELECT 42 AS answer')).rows[0].answer, 42)
    assert.strictEqual(await cancelQuery(client), false)
  } finally {
    await Promise.all([client.end(), observer.end()])
  }
})

suite.test('AbortSignal cancels an active transaction until explicit rollback', async () => {
  const clientConfig = config('signal')
  const client = new Client(clientConfig)
  const observer = new Client(helper.config)
  await Promise.all([client.connect(), observer.connect()])

  try {
    await client.query('BEGIN')
    const controller = new AbortController()
    const running = client.query({ text: 'SELECT pg_sleep(30)', signal: controller.signal })
    await waitUntilActive(observer, clientConfig.application_name)
    controller.abort()
    const cancellation = cancelQuery(client)

    await assert.rejects(running, (error) => error.code === '57014')
    assert.strictEqual(await cancellation, true)
    assert.strictEqual(client.getTransactionStatus(), 'E')
    await assert.rejects(client.query('SELECT 1'), (error) => error.code === '25P02')
    await client.query('ROLLBACK')
    assert.strictEqual(client.getTransactionStatus(), 'I')
    assert.strictEqual((await client.query('SELECT 1 AS ok')).rows[0].ok, 1)
  } finally {
    await Promise.all([client.end(), observer.end()])
  }
})

suite.test('holds a released size-one pool client until cancellation completes', async () => {
  const poolConfig = config('pool')
  const pool = new helper.pg.Pool({ ...poolConfig, max: 1 })
  const observer = new Client(helper.config)
  await observer.connect()

  try {
    const checkedOut = await pool.connect()
    const running = checkedOut.query('SELECT pg_sleep(30)')
    await waitUntilActive(observer, poolConfig.application_name)
    const cancellation = cancelQuery(checkedOut)
    const timeline = []
    const cancelledQuery = assert.rejects(running, (error) => error.code === '57014').then(() => timeline.push('query'))
    const cancelled = cancellation.then((result) => {
      assert.strictEqual(result, true)
      timeline.push('cancel')
    })

    checkedOut.release()
    const reacquired = await pool.connect()
    assert.strictEqual(reacquired, checkedOut)
    const following = reacquired.query('SELECT 7 AS answer').then((result) => {
      timeline.push('following')
      return result
    })

    await Promise.all([cancelledQuery, cancelled])
    assert.strictEqual((await following).rows[0].answer, 7)
    assert.strictEqual(timeline[timeline.length - 1], 'following')
    reacquired.release()
  } finally {
    await Promise.all([pool.end(), observer.end()])
  }
})

'use strict'

// A/B of two checkouts of this repo against the same database: the pg of `--head` over the pg of
// `--base`, scenario by scenario. Both arms run on the same machine in the same run, so what the
// machine does moves them together and the ratio holds still; that is the only number worth
// reading on a hosted runner, where the absolute queries per second are never the same twice.
//
// Each arm runs twice, in two processes, so every round also measures base against base and head
// against head: the same code on both sides, so whatever those ratios do is the noise of this
// run on this machine, and a head/base ratio is marked only when it moved further than that.
// All four stay up but only one measures at a time, the others wait: the load alternates between
// them one scenario at a time, in an order that changes every round, so the measurements behind
// a ratio are seconds apart and a drift of the machine lands on all of them. The reported
// speedup is the median of the per-round ratios.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, fork } = require('child_process')

// below this nothing is marked whatever the noise said: a same-code band can come out very
// narrow by luck on a handful of rounds, and a change this small is not worth a look anyway
const FLOOR = 0.02

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i]
  }
  return args
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const label = (dir) => {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return path.basename(path.resolve(dir))
  }
}

// one worker per arm, driven by messages: each send resolves with the worker's reply
const startArm = (dir, index) => {
  const child = fork(path.join(__dirname, 'worker.js'), [], {
    execArgv: ['--expose-gc'],
    env: { ...process.env, PG_BENCH_MODULE: path.resolve(dir), PG_BENCH_ARM: String(index) },
  })
  const waiting = []
  child.on('message', (msg) => {
    const { resolve, reject } = waiting.shift()
    msg.ok ? resolve(msg) : reject(new Error(msg.error))
  })
  child.on('exit', (code) => {
    for (const { reject } of waiting.splice(0)) reject(new Error(`worker for ${dir} exited with ${code}`))
  })
  const ready = new Promise((resolve, reject) => waiting.push({ resolve, reject }))
  return {
    ready,
    send: (msg) =>
      new Promise((resolve, reject) => {
        waiting.push({ resolve, reject })
        child.send(msg)
      }),
  }
}

const percent = (ratio) => `${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(1)}%`

const markdown = (labels, rows, rounds, duration) => {
  const lines = ['<!-- benchmark-comment -->', '', `## Benchmark: \`${labels.head}\` against \`${labels.base}\``, '']
  lines.push('| Scenario | Base q/s | Head q/s | Head / base | Rounds | Noise |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const row of rows) {
    const mark = row.notable ? (row.speedup < 1 ? ' :eyes:' : ' :trophy:') : ''
    const change = row.notable ? `**${percent(row.speedup)}**` : percent(row.speedup)
    lines.push(
      `| ${row.name}${mark} | ${row.base.toFixed(0)} | ${row.head.toFixed(0)} | ` +
        `${row.speedup.toFixed(3)}x (${change}) | ${row.min.toFixed(2)} to ${row.max.toFixed(2)} | ` +
        `±${(row.noise * 100).toFixed(1)}% |`
    )
  }
  lines.push('')
  lines.push(
    `${rounds} rounds of ${duration}s per scenario, each round measuring base, head and a second process of ` +
      `each one after the other, in an order that changes every round. "Head / base" is the median of the ` +
      `per-round ratios and "Rounds" their range. "Noise" is how far base/base and head/head, the same code on ` +
      `both sides, got from 1 in this same run: that is what the machine did, so a row is marked only when the ` +
      `median moved further than that, at least ${Math.round(FLOOR * 100)}%, and every round moved the same ` +
      `way: :eyes: slower, :trophy: faster. Only the ratio is comparable across runs, the absolute q/s depend ` +
      `on the runner.`
  )
  lines.push('')
  lines.push(`Node ${process.version}, ${os.cpus()[0]?.model || 'unknown cpu'}, ${os.cpus().length} cores.`)
  return lines.join('\n') + '\n'
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.base || !args.head) {
    throw new Error(
      'usage: node benchmark/compare.js --base <dir> --head <dir> [--rounds 4] [--duration 3] [--output file]'
    )
  }
  const rounds = Number(args.rounds || 4)
  const duration = Number(args.duration || 3)
  const warmup = Number(args.warmup || 1)
  const labels = { base: label(args.base), head: label(args.head) }

  // two processes per arm: base2 and head2 are the same code as base and head, measured
  // alongside them so the run can tell how much two identical arms differ on this machine
  const arms = {
    base: startArm(args.base, 0),
    head: startArm(args.head, 1),
    base2: startArm(args.base, 2),
    head2: startArm(args.head, 3),
  }
  const names = Object.keys(arms)
  const { scenarios } = await arms.base.ready
  for (const name of names) await arms[name].ready
  await arms.base.send({ type: 'setup' })

  const ratio = (qps, over, under) => qps[over].map((value, i) => value / qps[under][i])
  const rows = []
  for (const scenario of scenarios) {
    process.stderr.write(`${scenario}\n`)
    const qps = Object.fromEntries(names.map((name) => [name, []]))
    for (let i = -1; i < rounds; i++) {
      // the first round is a warmup on cold code and is thrown away
      const ms = (i < 0 ? warmup : duration) * 1000
      // rotates one place per round and flips on odd rounds, so each arm sees every position
      const rotated = names.map((_, k) => names[(k + i + 1) % names.length])
      const order = i % 2 ? rotated.reverse() : rotated
      for (const arm of order) {
        const reply = await arms[arm].send({ type: 'run', scenario, ms })
        if (i >= 0) qps[arm].push(reply.qps)
      }
    }
    const ratios = ratio(qps, 'head', 'base')
    const same = [...ratio(qps, 'base2', 'base'), ...ratio(qps, 'head2', 'head')]
    const speedup = median(ratios)
    const min = Math.min(...ratios)
    const max = Math.max(...ratios)
    const noise = Math.max(...same.map((value) => Math.abs(value - 1)))
    process.stderr.write(
      `  ${speedup.toFixed(3)}x (${min.toFixed(2)} to ${max.toFixed(2)}), noise ±${(noise * 100).toFixed(1)}%\n`
    )
    rows.push({
      name: scenario,
      base: median(qps.base),
      head: median(qps.head),
      speedup,
      min,
      max,
      noise,
      notable: Math.abs(speedup - 1) >= Math.max(noise, FLOOR) && (min > 1 || max < 1),
    })
  }
  await Promise.all(names.map((name) => arms[name].send({ type: 'end' })))

  const summary = markdown(labels, rows, rounds, duration)
  process.stdout.write(summary)
  if (args.output) fs.writeFileSync(args.output, summary)
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`)
  process.exit(1)
})

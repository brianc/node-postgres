'use strict'

// What the three fuzzers share: a seeded generator, so a failure prints the seed that reproduces
// it; the loop over rounds; and the shrinking, which drops the parts of a failing case one at a
// time for as long as the failure survives, so what gets printed is the few lines worth pasting
// into a test rather than the whole round.

/** @param {number} seed @returns {() => number} the same sequence for the same seed */
const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const pick = (rng, items) => items[Math.floor(rng() * items.length)]
const chance = (rng, p) => rng() < p

// strings a server can send: no NUL, since the protocol delimits them with one, and a spread
// from empty to long with multibyte and awkward characters in between
const ALPHABET = ['a', 'Z', '0', ' ', '_', "'", '"', '\\', '{', '}', ',', 'é', '€', '😀', '\n', '\t', 'ÿ']
const string = (rng, max = 12) => {
  const length = chance(rng, 0.1) ? 0 : chance(rng, 0.05) ? int(rng, 100, max * 40) : int(rng, 1, max)
  let out = ''
  for (let i = 0; i < length; i++) out += chance(rng, 0.7) ? pick(rng, ALPHABET.slice(0, 3)) : pick(rng, ALPHABET)
  return out
}

const bytes = (rng, max = 16) => {
  const length = chance(rng, 0.1) ? 0 : int(rng, 1, max)
  const out = Buffer.alloc(length)
  for (let i = 0; i < length; i++) out[i] = chance(rng, 0.2) ? 0 : int(rng, 0, 255)
  return out
}

// one canonical text for a value, so two results compare as strings: a Buffer by its bytes, a
// Date by its instant, and the rest by JSON with the keys in insertion order
const canon = (value) => {
  const replacer = (_, v) => {
    if (Buffer.isBuffer(v)) return `<${v.toString('hex')}>`
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) return `<${Buffer.from(v.data).toString('hex')}>`
    if (typeof v === 'bigint') return `${v}n`
    if (v === undefined) return '<undefined>'
    if (typeof v === 'number' && !Number.isFinite(v)) return `<${v}>`
    return v
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value, replacer)
}

const parseArgs = (argv) => {
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? fallback : Number(argv[at + 1])
  }
  return {
    rounds: flag('rounds', 100),
    seed: flag('seed', (Date.now() ^ (process.pid << 16)) >>> 0),
    keepGoing: argv.includes('--keep-going'),
    noShrink: argv.includes('--no-shrink'),
  }
}

/**
 * Drops items from a failing case one at a time, keeping every drop the failure survives.
 *
 * @template T
 * @param {T} plan
 * @param {(plan: T) => T[]} variants the smaller plans to try, each with one thing removed
 * @param {(plan: T) => Promise<boolean>} fails
 */
const shrink = async (plan, variants, fails) => {
  let current = plan
  let progress = true
  while (progress) {
    progress = false
    for (const smaller of variants(current)) {
      if (await fails(smaller)) {
        current = smaller
        progress = true
        break
      }
    }
  }
  return current
}

/**
 * The loop every fuzzer runs: draw a case per round, run it, and on a divergence print the seed,
 * shrink the case and print it as source.
 *
 * @param {object} fuzzer
 * @param {string} fuzzer.name
 * @param {(rng: () => number) => any} fuzzer.draw
 * @param {(plan: any) => Promise<string|null>} fuzzer.run a description of the divergence, or null
 * @param {(plan: any) => any[]} fuzzer.variants
 * @param {(plan: any) => string} fuzzer.source
 * @param {() => Promise<void>} [fuzzer.close]
 */
const main = async (fuzzer) => {
  const args = parseArgs(process.argv.slice(2))
  console.log(`${fuzzer.name}: ${args.rounds} rounds from seed ${args.seed}`)
  let found = 0
  for (let round = 0; round < args.rounds; round++) {
    const seed = (args.seed + round) >>> 0
    const plan = fuzzer.draw(mulberry32(seed))
    const divergence = await fuzzer.run(plan)
    if (!divergence) {
      if (round % 25 === 24) console.log(`  ${round + 1} rounds, no divergence`)
      continue
    }
    found++
    console.log(`\n=== divergence in round ${round}, seed ${seed} (replay: --seed ${seed} --rounds 1)`)
    console.log(divergence)
    if (!args.noShrink) {
      console.log('\nshrinking...')
      const small = await shrink(plan, fuzzer.variants, async (p) => Boolean(await fuzzer.run(p)))
      console.log(`\n${fuzzer.source(small)}`)
      console.log(await fuzzer.run(small))
    }
    if (!args.keepGoing) break
  }
  if (fuzzer.close) await fuzzer.close()
  console.log(`\n${found} divergence${found === 1 ? '' : 's'}`)
  process.exit(found ? 1 : 0)
}

module.exports = { mulberry32, int, pick, chance, string, bytes, canon, shrink, main }

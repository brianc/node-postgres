// file for microbenchmarking DataRow parsing
//
//   node dist/b-data-row.js
//
// Synthesizes a large text result set, hands it to the parser in socket-sized chunks, and times
// the three ways a consumer can treat a row: never reading a cell, reading the `fields` array
// once (what pg's `Result.parseRow` does), and touching every cell.

import { PerformanceObserver } from 'perf_hooks'
import { BackendMessage } from './messages'
import { Parser } from './parser'

const ROWS = 100_000
const COLUMNS = 40
const CHUNK_SIZE = 64 * 1024
const RUNS = 5
// width of the synthesized id column, so every row's frame is the same size
const ID_WIDTH = 7

// the parts of a DataRow message this benchmark consumes, i.e. without depending on its class
type Row = {
  fieldCount: number
  fields: (string | null)[]
}

type Mode = {
  name: string
  /** Returns a number, so that the work of consuming a row cannot be optimized away. */
  consume: (row: Row) => number
}

const modes: Mode[] = [
  // a consumer that never reads a cell, e.g. one decoding lazily on its own
  { name: 'fieldCount only', consume: (row) => row.fieldCount },
  // one `fields` read per row, i.e. what pg itself does
  { name: 'fields array', consume: (row) => row.fields.length },
  // every cell read, i.e. what building a row object ends up doing
  { name: 'every cell', consume: sumCellLengths },
]

main()

/** Times each consumption mode over the same synthesized chunks. */
async function main(): Promise<void> {
  const chunks = synthesizeChunks(ROWS, COLUMNS, CHUNK_SIZE)
  const bytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const mib = (bytes / 1024 / 1024).toFixed(1)
  console.log(`${ROWS} rows x ${COLUMNS} cells = ${mib} MiB in ${chunks.length} chunks of ${CHUNK_SIZE} bytes`)

  for (const mode of modes) {
    let checksum = run(chunks, mode) // warm up, uncounted
    let collections = 0
    let pause = 0
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        collections++
        pause += entry.duration
      }
    })
    observer.observe({ entryTypes: ['gc'] })
    const times: number[] = []
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now()
      checksum += run(chunks, mode)
      times.push(performance.now() - start)
      // let the observer's callbacks run, so this run's collections are counted
      await new Promise((resolve) => setImmediate(resolve))
    }
    observer.disconnect()
    times.sort((a, b) => a - b)
    const best = times[0].toFixed(1)
    const median = times[Math.floor(times.length / 2)].toFixed(1)
    // gc counts are an allocation-pressure proxy: a scavenge means another semi-space was filled
    const gc = `${(collections / RUNS).toFixed(1)} gc/run, ${(pause / RUNS).toFixed(1)}ms gc pause/run`
    console.log(`  ${mode.name.padEnd(16)} best ${best}ms  median ${median}ms  ${gc}  (checksum ${checksum})`)
  }
}

/** Parses every chunk with a fresh parser, returning the consumer's checksum. */
function run(chunks: Buffer[], mode: Mode): number {
  const parser = new Parser()
  let checksum = 0
  const consume = (msg: BackendMessage) => {
    checksum += mode.consume(msg as unknown as Row)
  }
  for (const chunk of chunks) {
    parser.parse(chunk, consume)
  }
  return checksum
}

/** Reads every cell of a row, i.e. the most a consumer can ask of `fields`. */
function sumCellLengths(row: Row): number {
  const { fields } = row
  let total = 0
  for (let i = 0; i < fields.length; i++) {
    const cell = fields[i]
    total += cell === null ? 0 : cell.length
  }
  return total
}

/** Builds `rows` DataRow frames and slices them into standalone reads, i.e. as a socket delivers them. */
function synthesizeChunks(rows: number, columns: number, chunkSize: number): Buffer[] {
  const cells = sampleCells(columns)
  const frameLength = 7 + cells.reduce((total, cell) => total + 4 + (cell === null ? 0 : Buffer.byteLength(cell)), 0)
  const stream = Buffer.allocUnsafe(rows * frameLength)
  let offset = 0
  for (let row = 0; row < rows; row++) {
    cells[0] = String(row).padStart(ID_WIDTH, '0')
    offset = writeDataRow(stream, offset, cells)
  }
  const chunks: Buffer[] = []
  for (let start = 0; start < offset; start += chunkSize) {
    // a copy, so each chunk is its own allocation like the ones net.Socket emits
    chunks.push(Buffer.from(stream.subarray(start, Math.min(start + chunkSize, offset))))
  }
  return chunks
}

/** A row's worth of representative text values, i.e. ids, timestamps, numbers, prose and NULLs. */
function sampleCells(columns: number): (string | null)[] {
  const samples = [
    '0'.repeat(ID_WIDTH),
    '4c1a0e2e-6b58-4e2f-9b6f-6a1d0f7f1b23',
    '2026-07-26 11:22:33.456789',
    '12345',
    'true',
    null,
    '199.95',
    'a short description of the row',
  ]
  const cells: (string | null)[] = new Array(columns)
  for (let i = 0; i < columns; i++) {
    cells[i] = samples[i % samples.length]
  }
  return cells
}

/** Writes one DataRow frame at `offset`, returning the offset just past it. */
function writeDataRow(into: Buffer, offset: number, cells: (string | null)[]): number {
  const start = offset
  into[offset] = 0x44 // 'D'
  offset += 5 // the int32 length is backfilled once the frame is written
  offset = into.writeInt16BE(cells.length, offset)
  for (const cell of cells) {
    if (cell === null) {
      offset = into.writeInt32BE(-1, offset)
    } else {
      offset = into.writeInt32BE(Buffer.byteLength(cell), offset)
      offset += into.write(cell, offset, 'utf-8')
    }
  }
  // the frame's length covers everything but the code byte
  into.writeInt32BE(offset - start - 1, start + 1)
  return offset
}

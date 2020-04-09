// file for microbenchmarking 

import { Writer } from './buffer-writer'
import { serialize } from './index'

const LOOPS = 1000
let count = 0
let start = Date.now()
const writer = new Writer()

const run = () => {
  if (count > LOOPS) {
    console.log(Date.now() - start)
    return;
  }
  count++
  for(let i = 0; i < LOOPS; i++) {
    serialize.describe({ type: 'P'})
    serialize.describe({ type: 'S'})
  }
  setImmediate(run)
}

run()

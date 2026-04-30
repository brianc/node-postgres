import Pool from 'pg-pool'

import Client from './client.ts'

import type { ClientConstructor, PoolOptions } from 'pg-pool'

class BoundPool extends Pool {
  constructor(options?: PoolOptions | null) {
    super(options ?? null, Client as unknown as ClientConstructor)
  }
}

export default BoundPool
export { BoundPool }

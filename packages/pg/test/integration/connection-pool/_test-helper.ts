import helper, { Client } from '../../_test-helper.ts'
import { versionGTE } from '../client/_test-helper.ts'

export * from '../../_test-helper.ts'
export { versionGTE }

export function client(cb?: (err?: Error | null) => void): InstanceType<typeof Client> {
  const c = new Client()
  c.connect(cb || (() => {}))
  return c
}

export default { ...helper, client, versionGTE }

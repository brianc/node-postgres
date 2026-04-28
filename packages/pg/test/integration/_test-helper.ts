import helper, { Client } from '../_test-helper.ts'

export * from '../_test-helper.ts'

export function client(cb?: (err?: Error) => void): InstanceType<typeof Client> {
  const c = new Client()
  c.connect(cb || (() => {}))
  return c
}

export default { ...helper, client }

import { describe, it, expect } from 'vitest'
import { parse, toClientConfig, parseIntoClientConfig } from '../src/index.ts'

const __dirname = import.meta.dirname

describe('toClientConfig', () => {
  it('converts connection info', () => {
    const config = parse('postgres://brian:pw@boom:381/lala')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.user).toBe('brian')
    expect(clientConfig.password).toBe('pw')
    expect(clientConfig.host).toBe('boom')
    expect(clientConfig.port).toBe(381)
    expect(clientConfig.database).toBe('lala')
  })

  it('converts query params', () => {
    const config = parse(
      'postgres:///?application_name=TheApp&fallback_application_name=TheAppFallback&client_encoding=utf8&options=-c geqo=off'
    )
    const clientConfig = toClientConfig(config)

    expect(clientConfig.application_name).toBe('TheApp')
    expect(clientConfig.fallback_application_name).toBe('TheAppFallback')
    expect(clientConfig.client_encoding).toBe('utf8')
    expect(clientConfig.options).toBe('-c geqo=off')
  })

  it('converts SSL boolean', () => {
    const config = parse('pg:///?ssl=true')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toBe(true)
  })

  it('converts sslmode=disable', () => {
    const config = parse('pg:///?sslmode=disable')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toBe(false)
  })

  it('converts sslmode=noverify', () => {
    const config = parse('pg:///?sslmode=no-verify')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('converts other sslmode options', () => {
    const config = parse('pg:///?sslmode=verify-ca')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toEqual({})
  })

  it('converts other sslmode options (duplicate)', () => {
    const config = parse('pg:///?sslmode=verify-ca')
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toEqual({})
  })

  it('converts ssl cert options', () => {
    const connectionString =
      'pg:///?sslcert=' +
      __dirname +
      '/example.cert&sslkey=' +
      __dirname +
      '/example.key&sslrootcert=' +
      __dirname +
      '/example.ca'
    const config = parse(connectionString)
    const clientConfig = toClientConfig(config)

    expect(clientConfig.ssl).toEqual({
      ca: 'example ca\n',
      cert: 'example cert\n',
      key: 'example key\n',
    })
  })

  it('converts unix domain sockets', () => {
    const config = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    const clientConfig = toClientConfig(config)
    expect(clientConfig.host).toBe('/some path/')
    expect(clientConfig.database).toBe('my[db]')
    expect(clientConfig.client_encoding).toBe('utf8')
  })

  it('handles invalid port', () => {
    const config = parse('postgres://@boom:381/lala')
    config.port = 'bogus'
    expect(() => toClientConfig(config)).toThrow()
  })

  it('handles invalid sslconfig values', () => {
    const config = parse('postgres://@boom/lala')
    config.ssl = {}
    ;(config.ssl as { cert?: string | null }).cert = null
    ;(config.ssl as { key?: string | undefined }).key = undefined

    const clientConfig = toClientConfig(config)

    expect(clientConfig.host).toBe('boom')
    expect(clientConfig.database).toBe('lala')
    expect(clientConfig.ssl).toEqual({})
  })
})

describe('parseIntoClientConfig', () => {
  it('converts url', () => {
    const clientConfig = parseIntoClientConfig('postgres://brian:pw@boom:381/lala')

    expect(clientConfig.user).toBe('brian')
    expect(clientConfig.password).toBe('pw')
    expect(clientConfig.host).toBe('boom')
    expect(clientConfig.port).toBe(381)
    expect(clientConfig.database).toBe('lala')
  })
})

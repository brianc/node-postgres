import chai from 'chai'
const expect = chai.expect
chai.should()

import { parse, toClientConfig, parseIntoClientConfig } from '../'

describe('toClientConfig', function () {
  it('converts connection info', function () {
    const config = parse('postgres://brian:pw@boom:381/lala')
    const clientConfig = toClientConfig(config)

    clientConfig.user?.should.equal('brian')
    clientConfig.password?.should.equal('pw')
    clientConfig.host?.should.equal('boom')
    clientConfig.port?.should.equal(381)
    clientConfig.database?.should.equal('lala')
  })

  it('converts query params', function () {
    const config = parse(
      'postgres:///?application_name=TheApp&fallback_application_name=TheAppFallback&client_encoding=utf8&options=-c geqo=off'
    )
    const clientConfig = toClientConfig(config)

    clientConfig.application_name?.should.equal('TheApp')
    clientConfig.fallback_application_name?.should.equal('TheAppFallback')
    clientConfig.client_encoding?.should.equal('utf8')
    clientConfig.options?.should.equal('-c geqo=off')
  })

  it('converts SSL boolean', function () {
    const config = parse('pg:///?ssl=true')
    const clientConfig = toClientConfig(config)

    clientConfig.ssl?.should.equal(true)
  })

  it('converts sslmode=disable', function () {
    const config = parse('pg:///?sslmode=disable')
    const clientConfig = toClientConfig(config)

    clientConfig.ssl?.should.equal(false)
  })

  it('converts sslmode=noverify', function () {
    const config = parse('pg:///?sslmode=no-verify')
    const clientConfig = toClientConfig(config)

    clientConfig.ssl?.should.deep.equal({
      rejectUnauthorized: false,
    })
  })

  it('converts other sslmode options', function () {
    const config = parse('pg:///?sslmode=verify-ca')
    const clientConfig = toClientConfig(config)

    clientConfig.ssl?.should.deep.equal({})
  })

  it('converts other sslmode options', function () {
    const config = parse('pg:///?sslmode=verify-ca')
    const clientConfig = toClientConfig(config)

    clientConfig.ssl?.should.deep.equal({})
  })

  it('converts ssl cert options', function () {
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

    clientConfig.ssl?.should.deep.equal({
      ca: 'example ca\n',
      cert: 'example cert\n',
      key: 'example key\n',
    })
  })

  it('converts unix domain sockets', function () {
    const config = parse('socket:/some path/?db=my[db]&encoding=utf8&client_encoding=bogus')
    const clientConfig = toClientConfig(config)
    clientConfig.host?.should.equal('/some path/')
    clientConfig.database?.should.equal('my[db]', 'must to be escaped and unescaped through "my%5Bdb%5D"')
    clientConfig.client_encoding?.should.equal('utf8')
  })

  it('handles invalid port', function () {
    const config = parse('postgres://@boom:381/lala')
    config.port = 'bogus'
    expect(() => toClientConfig(config)).to.throw()
  })

  it('handles invalid sslconfig values', function () {
    const config = parse('postgres://@boom/lala')
    config.ssl = {}
    config.ssl.cert = null
    config.ssl.key = undefined

    const clientConfig = toClientConfig(config)

    clientConfig.host?.should.equal('boom')
    clientConfig.database?.should.equal('lala')
    clientConfig.ssl?.should.deep.equal({})
  })
})

describe('parseIntoClientConfig', function () {
  it('converts url', function () {
    const clientConfig = parseIntoClientConfig('postgres://brian:pw@boom:381/lala')

    clientConfig.user?.should.equal('brian')
    clientConfig.password?.should.equal('pw')
    clientConfig.host?.should.equal('boom')
    clientConfig.port?.should.equal(381)
    clientConfig.database?.should.equal('lala')
  })
})

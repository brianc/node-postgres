'use strict'

/**
 * Netezza Handshake Implementation
 * Based on nzpy handshake protocol: https://github.com/IBM/nzpy/blob/master/nzpy/handshake.py
 *
 * This module implements the Netezza-specific connection handshake protocol
 * to enable PostgreSQL client compatibility with Netezza databases.
 */

const crypto = require('crypto')
const os = require('os')
const path = require('path')
const tls = require('tls')

// Connection Protocol Versions
const CP_VERSION_1 = 1
const CP_VERSION_2 = 2
const CP_VERSION_3 = 3
const CP_VERSION_4 = 4
const CP_VERSION_5 = 5
const CP_VERSION_6 = 6

// Handshake Version Opcodes
const HSV2_INVALID_OPCODE = 0
const HSV2_CLIENT_BEGIN = 1
const HSV2_DB = 2
const HSV2_USER = 3
const HSV2_OPTIONS = 4
const HSV2_TTY = 5
const HSV2_REMOTE_PID = 6
const HSV2_PRIOR_PID = 7
const HSV2_CLIENT_TYPE = 8
const HSV2_PROTOCOL = 9
const HSV2_HOSTCASE = 10
const HSV2_SSL_NEGOTIATE = 11
const HSV2_SSL_CONNECT = 12
const HSV2_APPNAME = 13
const HSV2_CLIENT_OS = 14
const HSV2_CLIENT_HOST_NAME = 15
const HSV2_CLIENT_OS_USER = 16
const HSV2_64BIT_VARLENA_ENABLED = 17
const HSV2_CLIENT_DONE = 1000

// PostgreSQL Protocol Versions
const PG_PROTOCOL_3 = 3
const PG_PROTOCOL_4 = 4
const PG_PROTOCOL_5 = 5

// Authentication Types
const AUTH_REQ_OK = 0
const AUTH_REQ_KRB4 = 1
const AUTH_REQ_KRB5 = 2
const AUTH_REQ_PASSWORD = 3
const AUTH_REQ_CRYPT = 4
const AUTH_REQ_MD5 = 5
const AUTH_REQ_SHA256 = 6

// Client Types
const NPS_CLIENT = 0
const IPS_CLIENT = 1
const NPSCLIENT_TYPE_NODE = 15 // Custom type for Node.js

// Protocol Message Types
const AUTHENTICATION_REQUEST = 'R'.codePointAt(0)
const ERROR_RESPONSE = 'E'.codePointAt(0)
const NOTICE_RESPONSE = 'N'.codePointAt(0)
const BACKEND_KEY_DATA = 'K'.codePointAt(0)
const READY_FOR_QUERY = 'Z'.codePointAt(0)

const NULL_BYTE = Buffer.from([0])

class NetezzaHandshake {
  constructor(stream, ssl, options = {}) {
    this.stream = stream
    this.ssl = ssl
    this.hsVersion = null
    this.protocol1 = null
    this.protocol2 = null

    // Guardium/audit information
    this.clientOS = os.platform()
    this.clientOSUser = os.userInfo().username
    this.clientHostName = os.hostname()
    this.appName = options.appName || path.basename(process.argv[1] || 'node')

    this.debug = options.debug || false

    // Buffer for incoming data during handshake
    this.buffer = Buffer.alloc(0)
    this.dataHandler = null
    this.setupDataHandler()
  }

  setupDataHandler() {
    this.dataHandler = (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.log(`Buffered ${chunk.length} bytes, total buffer: ${this.buffer.length} bytes`)
    }
    this.stream.on('data', this.dataHandler)
  }

  cleanup() {
    if (this.dataHandler) {
      this.stream.removeListener('data', this.dataHandler)
      this.dataHandler = null
    }
  }

  log(message, ...args) {
    if (this.debug) {
      console.log(`[NetezzaHandshake] ${message}`, ...args)
    }
  }

  // Pack 16-bit integer (short)
  packShort(value) {
    const buf = Buffer.allocUnsafe(2)
    buf.writeInt16BE(value, 0)
    return buf
  }

  // Pack 32-bit integer
  packInt(value) {
    const buf = Buffer.allocUnsafe(4)
    buf.writeInt32BE(value, 0)
    return buf
  }

  // Unpack 32-bit integer
  unpackInt(buffer) {
    return buffer.readInt32BE(0)
  }

  async startup(database, securityLevel, user, password, pgOptions) {
    try {
      this.log('=== Starting Netezza Connection Handshake ===')
      this.log(`Database: ${database || 'default'}`)
      this.log(`User: ${user}`)
      this.log(`Security Level: ${securityLevel}`)

      // Step 1: Negotiate handshake version
      this.log('\n[Step 1] Negotiating handshake version...')
      if (!(await this.negotiateHandshake())) {
        throw new Error('Handshake negotiation failed')
      }
      this.log(`Handshake version negotiated: CP_VERSION_${this.hsVersion}`)

      // Step 2: Send handshake information
      this.log('\n[Step 2] Sending handshake information...')
      if (!(await this.sendHandshakeInfo(database, securityLevel, user, pgOptions))) {
        throw new Error('Failed to send handshake information')
      }
      this.log(' Handshake information sent successfully')

      // Step 3: Authenticate
      this.log('\n[Step 3] Authenticating user...')
      if (!(await this.authenticate(password))) {
        throw new Error('Authentication failed')
      }
      this.log('Authentication successful')

      // Step 4: Wait for connection complete
      this.log('\n[Step 4] Waiting for connection ready signal...')
      if (!(await this.waitConnectionComplete())) {
        throw new Error('Connection completion failed')
      }
      this.log(' Connection ready')

      this.log('\n=== Netezza Handshake Completed Successfully ===')
      this.log(`Protocol Version: ${this.protocol1}.${this.protocol2}`)

      // Return any remaining buffer data so it can be processed after listeners are attached
      const remainingBuffer = this.buffer
      this.buffer = Buffer.alloc(0)

      if (remainingBuffer.length > 0) {
        this.log(`Returning ${remainingBuffer.length} bytes of remaining buffer data`)
      }

      this.cleanup()
      this.log('Cleaned up handshake data handler')

      // Return the stream and other info
      return {
        success: true,
        stream: this.stream,
        remainingBuffer,
        needsInitialization: true,
      }
    } catch (error) {
      this.log('\nHandshake Failed:', error.message)
      // Clean up on error too
      this.cleanup()
      throw error
    }
  }

  async negotiateHandshake() {
    let version = CP_VERSION_6
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.log(`Trying handshake version: ${version}`)

      // Send handshake version
      const payload = Buffer.concat([this.packShort(HSV2_CLIENT_BEGIN), this.packShort(version)])

      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
      this.log('Handshake request sent')

      // Wait for response
      const response = await this.readBytes(1)
      this.log(`Handshake response: ${response.toString()} (${response[0]})`)

      if (response.toString() === 'N') {
        // Accepted
        this.hsVersion = version
        this.protocol2 = 0
        return true
      } else if (response.toString() === 'M') {
        // Server suggests different version
        const suggestedVersion = await this.readBytes(1)
        const versionChar = suggestedVersion.toString()

        this.log(`Suggested version: ${suggestedVersion}`)
        this.log(`Server suggested version: ${versionChar}`)
        if (versionChar === '2') version = CP_VERSION_2
        else if (versionChar === '3') version = CP_VERSION_3
        else if (versionChar === '4') version = CP_VERSION_4
        else if (versionChar === '5') version = CP_VERSION_5
        else {
          throw new Error(`Unsupported version suggested: ${versionChar}`)
        }
      } else if (response.toString() === 'E') {
        throw new Error('Bad attribute value error')
      } else {
        throw new Error('Bad protocol error')
      }
    }
  }

  async sendHandshakeInfo(database, securityLevel, user, pgOptions) {
    // Send database name first
    if (!(await this.sendDatabase(database))) {
      return false
    }

    // Set protocol version BEFORE security negotiation
    if (!this.setNextDataProtocol()) {
      return false
    }

    // Handle SSL negotiation if needed
    if (!(await this.secureSession(securityLevel))) {
      return false
    }

    // Send handshake based on version
    if (this.hsVersion === CP_VERSION_6 || this.hsVersion === CP_VERSION_4) {
      return await this.sendHandshakeVersion4(user, pgOptions)
    } else if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_3 || this.hsVersion === CP_VERSION_2) {
      return await this.sendHandshakeVersion2(user, pgOptions)
    }

    return true
  }

  async sendDatabase(database) {
    if (!database) {
      this.log('No database specified, skipping database selection')
      return true
    }

    this.log(`Sending database name: ${database}`)
    const dbBuffer = Buffer.from(database, 'utf8')
    const payload = Buffer.concat([this.packShort(HSV2_DB), dbBuffer, NULL_BYTE])

    this.stream.write(this.packInt(payload.length + 4))
    this.stream.write(payload)

    const response = await this.readBytes(1)
    if (response.toString() === 'N') {
      this.log(' Database accepted by server')
      return true
    } else if (response[0] === ERROR_RESPONSE) {
      throw new Error('Database authentication error')
    }
    return false
  }

  setNextDataProtocol() {
    if (this.protocol2 === 0) {
      this.protocol2 = PG_PROTOCOL_5
    } else if (this.protocol2 === 5) {
      this.protocol2 = PG_PROTOCOL_4
    } else if (this.protocol2 === 4) {
      this.protocol2 = PG_PROTOCOL_3
    } else {
      return false
    }

    this.protocol1 = PG_PROTOCOL_3
    this.log(`Protocol set to: ${this.protocol1}.${this.protocol2}`)
    return true
  }

  async secureSession(securityLevel) {
    // Security levels:
    // 0 - Preferred Unsecured
    // 1 - Only Unsecured
    // 2 - Preferred Secured
    // 3 - Only Secured

    securityLevel = securityLevel || 0
    const securityLevelNames = ['Preferred Unsecured', 'Only Unsecured', 'Preferred Secured', 'Only Secured']
    this.log(`Negotiating SSL/TLS: ${securityLevelNames[securityLevel]} (level ${securityLevel})`)

    // Send SSL negotiation message
    const payload = Buffer.concat([this.packShort(HSV2_SSL_NEGOTIATE), this.packInt(securityLevel)])

    this.stream.write(this.packInt(payload.length + 4))
    this.stream.write(payload)
    this.log('Sent SSL negotiation request to server')

    // Wait for response
    const response = await this.readBytes(1)
    const responseChar = String.fromCharCode(response[0])
    this.log(`Server SSL response: '${responseChar}'`)

    if (responseChar === 'N') {
      // Server accepts unsecured connection
      this.log('Server accepted unsecured connection')
      return true
    } else if (responseChar === 'S') {
      // Server wants SSL
      this.log('Server requires SSL/TLS connection')

      // Send SSL connect message
      const connectPayload = Buffer.concat([this.packShort(HSV2_SSL_CONNECT), this.packInt(securityLevel)])

      this.stream.write(this.packInt(connectPayload.length + 4))
      this.stream.write(connectPayload)
      this.log('Sent SSL connect message')

      // Upgrade to TLS
      this.log('Upgrading connection to TLS...')
      await this.upgradeToTLS()

      this.log('TLS connection established successfully')
      return true
    } else if (responseChar === 'E') {
      throw new Error('Server rejected security negotiation')
    } else {
      throw new Error(`Unknown SSL negotiation response: ${responseChar}`)
    }
  }

  async upgradeToTLS() {
    return new Promise((resolve, reject) => {
      // Remove existing data handler
      this.cleanup()

      const tlsOptions = {
        socket: this.stream,
        rejectUnauthorized: this.ssl && this.ssl.rejectUnauthorized !== false,
      }

      if (this.ssl && typeof this.ssl === 'object') {
        if (this.ssl.ca) tlsOptions.ca = this.ssl.ca
        if (this.ssl.cert) tlsOptions.cert = this.ssl.cert
        if (this.ssl.key) tlsOptions.key = this.ssl.key
      }

      const tlsSocket = tls.connect(tlsOptions)

      tlsSocket.once('secureConnect', () => {
        this.log('TLS connection established')
        // Update stream reference to the TLS socket
        this.stream = tlsSocket

        // Clear any old buffer data from the non-TLS connection
        this.buffer = Buffer.alloc(0)
        this.setupDataHandler()

        // Use setImmediate to ensure we're in the next event loop tick
        setImmediate(() => {
          this.log(`TLS socket ready, buffer size: ${this.buffer.length}`)
          resolve()
        })
      })

      tlsSocket.once('error', (err) => {
        reject(new Error(`TLS upgrade failed: ${err.message}`))
      })
    })
  }

  async sendHandshakeVersion2(user, pgOptions) {
    const userBuffer = Buffer.from(user, 'utf8')

    const steps = [
      { opcode: HSV2_USER, data: Buffer.concat([userBuffer, NULL_BYTE]) },
      { opcode: HSV2_PROTOCOL, data: Buffer.concat([this.packShort(this.protocol1), this.packShort(this.protocol2)]) },
      { opcode: HSV2_REMOTE_PID, data: this.packInt(process.pid) },
      { opcode: HSV2_OPTIONS, data: pgOptions ? Buffer.concat([Buffer.from(pgOptions, 'utf8'), NULL_BYTE]) : null },
      { opcode: HSV2_CLIENT_TYPE, data: this.packShort(NPSCLIENT_TYPE_NODE) },
    ]

    if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_6) {
      steps.push({ opcode: HSV2_64BIT_VARLENA_ENABLED, data: this.packShort(IPS_CLIENT) })
    }

    steps.push({ opcode: HSV2_CLIENT_DONE, data: null })

    for (const step of steps) {
      if (step.data === null && step.opcode !== HSV2_CLIENT_DONE) {
        continue
      }

      const payload = step.data ? Buffer.concat([this.packShort(step.opcode), step.data]) : this.packShort(step.opcode)

      // Write and ensure it's flushed before waiting for response
      await new Promise((resolve) => {
        this.stream.write(this.packInt(payload.length + 4), () => {
          this.stream.write(payload, resolve)
        })
      })

      if (step.opcode === HSV2_CLIENT_DONE) {
        return true
      }

      const response = await this.readBytes(1)
      if (response.toString() !== 'N') {
        if (response[0] === ERROR_RESPONSE) {
          throw new Error('Connection failed during handshake')
        }
        return false
      }
    }

    return true
  }

  async sendHandshakeVersion4(user, pgOptions) {
    const userBuffer = Buffer.from(user, 'utf8')

    const steps = [
      { opcode: HSV2_USER, data: Buffer.concat([userBuffer, NULL_BYTE]) },
      { opcode: HSV2_APPNAME, data: Buffer.concat([Buffer.from(this.appName, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_OS, data: Buffer.concat([Buffer.from(this.clientOS, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_HOST_NAME, data: Buffer.concat([Buffer.from(this.clientHostName, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_CLIENT_OS_USER, data: Buffer.concat([Buffer.from(this.clientOSUser, 'utf8'), NULL_BYTE]) },
      { opcode: HSV2_PROTOCOL, data: Buffer.concat([this.packShort(this.protocol1), this.packShort(this.protocol2)]) },
      { opcode: HSV2_REMOTE_PID, data: this.packInt(process.pid) },
      { opcode: HSV2_OPTIONS, data: pgOptions ? Buffer.concat([Buffer.from(pgOptions, 'utf8'), NULL_BYTE]) : null },
      { opcode: HSV2_CLIENT_TYPE, data: this.packShort(NPSCLIENT_TYPE_NODE) },
    ]

    if (this.hsVersion === CP_VERSION_5 || this.hsVersion === CP_VERSION_6) {
      steps.push({ opcode: HSV2_64BIT_VARLENA_ENABLED, data: this.packShort(IPS_CLIENT) })
    }

    steps.push({ opcode: HSV2_CLIENT_DONE, data: null })

    for (const step of steps) {
      if (step.data === null && step.opcode !== HSV2_CLIENT_DONE) {
        continue
      }

      const payload = step.data ? Buffer.concat([this.packShort(step.opcode), step.data]) : this.packShort(step.opcode)

      // Write and ensure it's flushed before waiting for response
      await new Promise((resolve) => {
        this.stream.write(this.packInt(payload.length + 4), () => {
          this.stream.write(payload, resolve)
        })
      })

      if (step.opcode === HSV2_CLIENT_DONE) {
        return true
      }

      const response = await this.readBytes(1)
      if (response.toString() !== 'N') {
        if (response[0] === ERROR_RESPONSE) {
          throw new Error('Connection failed during handshake')
        }
        return false
      }
    }

    return true
  }

  async authenticate(password) {
    let response = await this.readBytes(1)
    if (response.toString() === 'N') {
      this.log('Received acknowledgment, reading authentication request...')
      response = await this.readBytes(1)
    }

    if (response[0] !== AUTHENTICATION_REQUEST) {
      throw new Error(`Expected authentication request, got: ${response.toString()} (${response[0]})`)
    }

    const authType = this.unpackInt(await this.readBytes(4))
    const authTypeNames = {
      0: 'AUTH_REQ_OK (no authentication required)',
      3: 'AUTH_REQ_PASSWORD (plain text)',
      5: 'AUTH_REQ_MD5 (MD5 hashed)',
      6: 'AUTH_REQ_SHA256 (SHA256 hashed)',
    }
    this.log(`Server requested authentication: ${authTypeNames[authType] || `Unknown type ${authType}`}`)

    if (authType === AUTH_REQ_OK) {
      this.log('No authentication required')
      return true
    }

    const passwordBuffer = Buffer.from(password, 'utf8')

    if (authType === AUTH_REQ_PASSWORD) {
      // Plain password
      this.log('Sending plain text password...')
      const payload = Buffer.concat([passwordBuffer, NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
      this.log('Password sent')
    } else if (authType === AUTH_REQ_MD5) {
      // MD5 password
      this.log('Sending MD5 password')
      const salt = await this.readBytes(2)
      const hash = crypto.createHash('md5')
      hash.update(Buffer.concat([salt, passwordBuffer]))
      const md5pwd = hash.digest('base64').replace(/=+$/, '')

      const payload = Buffer.concat([Buffer.from(md5pwd, 'utf8'), NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
    } else if (authType === AUTH_REQ_SHA256) {
      // SHA256 password
      this.log('Sending SHA256 password')
      const salt = await this.readBytes(2)
      const hash = crypto.createHash('sha256')
      hash.update(Buffer.concat([salt, passwordBuffer]))
      const sha256pwd = hash.digest('base64').replace(/=+$/, '')

      const payload = Buffer.concat([Buffer.from(sha256pwd, 'utf8'), NULL_BYTE])
      this.stream.write(this.packInt(payload.length + 4))
      this.stream.write(payload)
    } else {
      throw new Error(`Unsupported authentication type: ${authType}`)
    }

    return true
  }

  async waitConnectionComplete() {
    this.log('Waiting for server messages...')
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.readBytes(1)
      const msgType = response[0]
      const msgChar = String.fromCharCode(msgType)
      this.log(`Received message type '${msgChar}' (0x${msgType.toString(16)})`)

      // Note: In Netezza handshake, messages have non-standard format
      // For messages other than R, N, E: read and discard 8 bytes

      if (msgType !== AUTHENTICATION_REQUEST && msgType !== NOTICE_RESPONSE && msgType !== ERROR_RESPONSE) {
        // Read and discard 8 bytes
        await this.readBytes(8)
      }

      switch (msgType) {
        case AUTHENTICATION_REQUEST: {
          // 'R' - Authentication request
          const authType = this.unpackInt(await this.readBytes(4))
          if (authType === AUTH_REQ_OK) {
            this.log('Authentication confirmed by server (AUTH_REQ_OK)')
          } else {
            this.log(`Unexpected auth type during completion: ${authType}`)
          }
          break
        }

        case BACKEND_KEY_DATA: {
          // 'K' - Backend key data: After discarding 8 bytes, read 8 more (4 for PID, 4 for key)
          const pid = this.unpackInt(await this.readBytes(4))
          const key = this.unpackInt(await this.readBytes(4))
          this.log(`Backend Key Data (K): PID=${pid}, SecretKey=${key}`)
          break
        }

        case READY_FOR_QUERY:
          // 'Z' - Ready for query - connection is complete!
          this.log('Received ReadyForQuery (Z) - Connection established!')
          return true

        case NOTICE_RESPONSE: {
          await this.readBytes(4)
          break
        }

        case ERROR_RESPONSE: {
          // 'E' - Error response - read up to 2000 bytes
          const errorBuf = await this.readBytes(2000)
          const errorMsg = errorBuf.toString('utf8').replace(/\0/g, '')
          throw new Error(`Server error: ${errorMsg}`)
        }

        default:
          // Unknown message type - 8 bytes already discarded above
          this.log(`Unknown message type '${msgChar}' (0x${msgType.toString(16)})`)
          break
      }
    }
  }

  readBytes(count) {
    return new Promise((resolve, reject) => {
      // Check if we already have enough data in buffer
      if (this.buffer.length >= count) {
        const result = this.buffer.slice(0, count)
        this.buffer = this.buffer.slice(count)
        resolve(result)
        return
      }

      // Need to wait for more data
      let timeoutId = null
      let resolved = false

      const checkAndResolve = () => {
        if (!resolved && this.buffer.length >= count) {
          resolved = true
          const result = this.buffer.slice(0, count)
          this.buffer = this.buffer.slice(count)
          this.log(`Read ${result.length} bytes: ${result.toString('hex')}`)

          if (timeoutId) clearTimeout(timeoutId)
          this.stream.removeListener('error', errorHandler)
          this.stream.removeListener('end', endHandler)
          this.stream.removeListener('data', tempDataHandler)

          // Re-attach the original data handler
          this.stream.on('data', this.dataHandler)

          resolve(result)
          return true
        }
        return false
      }

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.stream.removeListener('data', tempDataHandler)
          this.stream.removeListener('error', errorHandler)
          this.stream.removeListener('end', endHandler)
          // Re-attach the original data handler
          this.stream.on('data', this.dataHandler)
          reject(new Error(`Timeout reading ${count} bytes. Buffer has ${this.buffer.length} bytes.`))
        }
      }, 30000)

      // Add temporary data handler
      const tempDataHandler = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        checkAndResolve()
      }

      const errorHandler = (err) => {
        if (!resolved) {
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          this.stream.removeListener('data', tempDataHandler)
          this.stream.removeListener('end', endHandler)
          // Re-attach the original data handler
          this.stream.on('data', this.dataHandler)
          reject(err)
        }
      }

      const endHandler = () => {
        if (!resolved) {
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          this.stream.removeListener('data', tempDataHandler)
          this.stream.removeListener('error', errorHandler)
          // Re-attach the original data handler
          this.stream.on('data', this.dataHandler)
          reject(new Error(`Stream ended before reading required bytes. Needed ${count}, have ${this.buffer.length}`))
        }
      }

      // Remove the original data handler temporarily
      this.stream.removeListener('data', this.dataHandler)

      this.stream.on('data', tempDataHandler)
      this.stream.once('error', errorHandler)
      this.stream.once('end', endHandler)

      // Check immediately in case data arrived between buffer check and handler setup
      checkAndResolve()
    })
  }
}

module.exports = NetezzaHandshake

import { Readable } from 'stream'
import { DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => {
    // Errors thrown by the callback are the caller's business and must keep propagating.
    // Errors thrown by the parser mean the server sent something we cannot handle: fail
    // the stream instead of letting the exception escape the 'data' listener.
    let callbackThrew = false
    try {
      parser.parse(buffer, (message) => {
        try {
          callback(message)
        } catch (err) {
          callbackThrew = true
          throw err
        }
      })
    } catch (err) {
      if (callbackThrew) {
        throw err
      }
      if (typeof (stream as Readable).destroy === 'function') {
        ;(stream as Readable).destroy(err as Error)
      } else {
        stream.emit('error', err)
      }
    }
  })
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError }

import { DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => {
    let callbackThrew = false
    try {
      parser.parse(buffer, (message) => {
        try {
          callback(message)
        } catch (error) {
          callbackThrew = true
          throw error
        }
      })
    } catch (error) {
      // A caller's callback error is not a malformed PostgreSQL message.
      if (callbackThrew) {
        throw error
      }
      const failure = error instanceof Error ? error : new Error(String(error))
      if ('destroy' in stream && typeof stream.destroy === 'function') {
        stream.destroy(failure)
      } else {
        stream.emit('error', failure)
      }
    }
  })
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError }

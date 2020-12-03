import { BackendMessage, DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve, reject) => {
    stream.on('end', () => resolve())
    stream.on('error', (err) => reject(err))
  })
}

export { serialize, DatabaseError }

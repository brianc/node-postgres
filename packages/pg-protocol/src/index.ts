import { DatabaseError } from './messages.ts'
import { serialize } from './serializer.ts'
import { Parser, type MessageCallback } from './parser.ts'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError }

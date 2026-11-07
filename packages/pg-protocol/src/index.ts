import { DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'

export function parse(
  stream: NodeJS.ReadableStream,
  callback: MessageCallback,
  options?: { lazyRows?: boolean }
): Promise<void> {
  const parser = new Parser(options)
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError }

import { BackendMessage } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'
import { TextEncoding } from './text-encoding'

export function parse(
  stream: NodeJS.ReadableStream,
  callback: MessageCallback,
  encoding: TextEncoding = 'utf8'
): Promise<void> {
  const parser = new Parser(encoding)
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize }

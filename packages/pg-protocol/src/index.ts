import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'
import { TextEncoding, parseEncoding } from './text-encoding'

export function parse(
  stream: NodeJS.ReadableStream,
  callback: MessageCallback,
  defaultEncoding = TextEncoding.UTF8
): Promise<void> {
  const parser = new Parser(undefined, defaultEncoding)
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, parseEncoding }

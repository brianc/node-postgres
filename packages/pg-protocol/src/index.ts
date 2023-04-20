import { DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'
import { POSTGRES_ERRORS_BY_CODE, POSTGRES_ERRORS } from './postgres-error-codes'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback))
  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError, POSTGRES_ERRORS_BY_CODE, POSTGRES_ERRORS }

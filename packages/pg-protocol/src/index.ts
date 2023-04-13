import { BackendMessage, DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'
import {pipeline} from 'stream';

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()
  stream.on('data', (buffer: Buffer) => parser.parse(buffer, callback));

  pipeline(
    stream,
    parser.splitMessagesTransform.bind(parser),
    parser.convertToMessageTransform.bind(parser),
    async function* (stream) {
      for await(const message of stream) {
        callback(message)
      }
    },
    (err) => err ? reject(err) : resolve()
  );

  return new Promise((resolve) => stream.on('end', () => resolve()))
}

export { serialize, DatabaseError }

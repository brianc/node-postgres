import { BackendMessage, DatabaseError } from './messages'
import { serialize } from './serializer'
import { Parser, MessageCallback } from './parser'
import { pipeline } from 'stream'

export function parse(stream: NodeJS.ReadableStream, callback: MessageCallback): Promise<void> {
  const parser = new Parser()

  return new Promise((resolve, reject) => {
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
  })
}

export { serialize, DatabaseError }

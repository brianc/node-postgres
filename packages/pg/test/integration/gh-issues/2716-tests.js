'use strict'
const helper = require('../test-helper')

const suite = new helper.Suite()

// https://github.com/brianc/node-postgres/issues/2716
suite.testAsync('client.end() should resolve if already ended', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  // this should resolve only when the underlying socket is fully closed, both
  // the readable part ("end" event) & writable part ("close" event).

  // https://nodejs.org/docs/latest-v16.x/api/net.html#event-end
  // > Emitted when the other end of the socket signals the end of
  // > transmission, thus ending the readable side of the socket.

  // https://nodejs.org/docs/latest-v16.x/api/net.html#event-close_1
  // > Emitted once the socket is fully closed.

  // here: stream = socket

  await client.end()
  // connection.end()
  //   stream.end()
  // ...
  // stream emits "end"
  //   not listening to this event anymore so the promise doesn't resolve yet
  // stream emits "close"; no more events will be emitted from the stream
  //   connection emits "end"
  //     promise resolved

  // This should now resolve immediately, rather than wait for connection.on('end')
  await client.end()

  // this should resolve immediately, rather than waiting forever
  await client.end()
})

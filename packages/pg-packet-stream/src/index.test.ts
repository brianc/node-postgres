import 'mocha';
import { PgPacketStream, Packet } from './'
import { expect } from 'chai'
import chunky from 'chunky'

const consume = async (stream: PgPacketStream, count: number): Promise<Packet[]> => {
  const result: Packet[] = [];

  return new Promise((resolve) => {
    const read = () => {
      stream.once('readable', () => {
        let packet;
        while (packet = stream.read()) {
          result.push(packet)
        }
        if (result.length === count) {
          resolve(result);
        } else {
          read()
        }

      })
    }
    read()
  })
}

const emptyMessage = Buffer.from([0x0a, 0x00, 0x00, 0x00, 0x04])
const oneByteMessage = Buffer.from([0x0b, 0x00, 0x00, 0x00, 0x05, 0x0a])
const bigMessage = Buffer.from([0x0f, 0x00, 0x00, 0x00, 0x14, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e0, 0x0f])

describe('PgPacketStream', () => {
  it('should chunk a perfect input packet', async () => {
    const stream = new PgPacketStream()
    stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x04]))
    stream.end()
    const buffers = await consume(stream, 1)
    expect(buffers).to.have.length(1)
    expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]))
  });

  it('should read 2 chunks into perfect input packet', async () => {
    const stream = new PgPacketStream()
    stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x08]))
    stream.write(Buffer.from([0x1, 0x2, 0x3, 0x4]))
    stream.end()
    const buffers = await consume(stream, 1)
    expect(buffers).to.have.length(1)
    expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x08, 0x1, 0x2, 0x3, 0x4]))
  });

  it('should read a bunch of big messages', async () => {
    const stream = new PgPacketStream();
    let totalBuffer = Buffer.allocUnsafe(0);
    const num = 2;
    for (let i = 0; i < 2; i++) {
      totalBuffer = Buffer.concat([totalBuffer, bigMessage, bigMessage])
    }
    const chunks = chunky(totalBuffer)
    for (const chunk of chunks) {
      stream.write(chunk)
    }
    stream.end()
    const messages = await consume(stream, num * 2)
    expect(messages.map(x => x.code)).to.eql(new Array(num * 2).fill(0x0f))
  })

  it('should read multiple messages in a single chunk', async () => {
    const stream = new PgPacketStream()
    stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04]))
    stream.end()
    const buffers = await consume(stream, 2)
    expect(buffers).to.have.length(2)
    expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]))
    expect(buffers[1].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]))
  });

  it('should read multiple chunks into multiple packets', async () => {
    const stream = new PgPacketStream()
    stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x05, 0x0a, 0x01, 0x00, 0x00, 0x00, 0x05, 0x0b]))
    stream.write(Buffer.from([0x01, 0x00, 0x00]));
    stream.write(Buffer.from([0x00, 0x06, 0x0c, 0x0d, 0x03, 0x00, 0x00, 0x00, 0x04]))
    stream.end()
    const buffers = await consume(stream, 4)
    expect(buffers).to.have.length(4)
    expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x05, 0x0a]))
    expect(buffers[1].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x05, 0x0b]))
    expect(buffers[2].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x06, 0x0c, 0x0d]))
    expect(buffers[3].packet).to.deep.equal(Buffer.from([0x3, 0x00, 0x00, 0x00, 0x04]))
  });

  it('reads packet that spans multiple chunks', async () => {
    const stream = new PgPacketStream()
    stream.write(Buffer.from([0x0d, 0x00, 0x00, 0x00]))
    stream.write(Buffer.from([0x09])) // length
    stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]))
    stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]))
    stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]))
    stream.end()
    const buffers = await consume(stream, 1)
    expect(buffers).to.have.length(1)
  })
});

// Helper buffer factories matching the PostgreSQL wire-protocol message formats.
// Used by unit tests that don't need a real socket — `_test-buffers` are simulated
// server messages.

import { Buffer } from 'node:buffer'

import BufferList from './_buffer-list.ts'

interface ErrorOrNoticeField {
  type: string
  value: string
}

const errorOrNotice = (fields?: ErrorOrNoticeField[]): BufferList => {
  const list = fields || []
  const buf = new BufferList()
  list.forEach((field) => {
    buf.addChar(field.type)
    buf.addCString(field.value)
  })
  return buf.add(Buffer.from([0])) // terminator
}

const buffers = {
  readyForQuery(): Buffer {
    return new BufferList().add(Buffer.from('I')).join(true, 'Z')
  },

  authenticationOk(): Buffer {
    return new BufferList().addInt32(0).join(true, 'R')
  },

  authenticationCleartextPassword(): Buffer {
    return new BufferList().addInt32(3).join(true, 'R')
  },

  authenticationMD5Password(): Buffer {
    return new BufferList()
      .addInt32(5)
      .add(Buffer.from([1, 2, 3, 4]))
      .join(true, 'R')
  },

  authenticationSASL(): Buffer {
    return new BufferList().addInt32(10).addCString('SCRAM-SHA-256').addCString('').join(true, 'R')
  },

  authenticationSASLContinue(): Buffer {
    return new BufferList().addInt32(11).addString('data').join(true, 'R')
  },

  authenticationSASLFinal(): Buffer {
    return new BufferList().addInt32(12).addString('data').join(true, 'R')
  },

  parameterStatus(name: string, value: string): Buffer {
    return new BufferList().addCString(name).addCString(value).join(true, 'S')
  },

  backendKeyData(processID: number, secretKey: number): Buffer {
    return new BufferList().addInt32(processID).addInt32(secretKey).join(true, 'K')
  },

  commandComplete(text: string): Buffer {
    return new BufferList().addCString(text).join(true, 'C')
  },

  rowDescription(
    fields?: Array<{
      name: string
      tableID?: number
      attributeNumber?: number
      dataTypeID?: number
      dataTypeSize?: number
      typeModifier?: number
      formatCode?: number
    }>
  ): Buffer {
    const list = fields || []
    const buf = new BufferList()
    buf.addInt16(list.length)
    list.forEach((field) => {
      buf
        .addCString(field.name)
        .addInt32(field.tableID || 0)
        .addInt16(field.attributeNumber || 0)
        .addInt32(field.dataTypeID || 0)
        .addInt16(field.dataTypeSize || 0)
        .addInt32(field.typeModifier || 0)
        .addInt16(field.formatCode || 0)
    })
    return buf.join(true, 'T')
  },

  dataRow(columns?: Array<string | null>): Buffer {
    const cols = columns || []
    const buf = new BufferList()
    buf.addInt16(cols.length)
    cols.forEach((col) => {
      if (col == null) {
        buf.addInt32(-1)
      } else {
        const strBuf = Buffer.from(col, 'utf8')
        buf.addInt32(strBuf.length)
        buf.add(strBuf)
      }
    })
    return buf.join(true, 'D')
  },

  error(fields?: ErrorOrNoticeField[]): Buffer {
    return errorOrNotice(fields).join(true, 'E')
  },

  notice(fields?: ErrorOrNoticeField[]): Buffer {
    return errorOrNotice(fields).join(true, 'N')
  },

  parseComplete(): Buffer {
    return new BufferList().join(true, '1')
  },

  bindComplete(): Buffer {
    return new BufferList().join(true, '2')
  },

  notification(id: number, channel: string, payload: string): Buffer {
    return new BufferList().addInt32(id).addCString(channel).addCString(payload).join(true, 'A')
  },

  emptyQuery(): Buffer {
    return new BufferList().join(true, 'I')
  },

  portalSuspended(): Buffer {
    return new BufferList().join(true, 's')
  },

  copyIn(cols: number): Buffer {
    const list = new BufferList()
      // text mode
      .add(Buffer.from([0]))
      // column count
      .addInt16(cols)
    for (let i = 0; i < cols; i++) {
      list.addInt16(i)
    }
    return list.join(true, 'G')
  },

  copyData(bytes: Buffer): Buffer {
    return new BufferList().add(bytes).join(true, 'd')
  },
}

export default buffers

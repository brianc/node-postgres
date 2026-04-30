// https://www.postgresql.org/docs/current/protocol-message-formats.html
import { BufferList } from './_buffer-list.ts'

export const buffers = {
  readyForQuery() {
    return new BufferList().add(Buffer.from('I')).join(true, 'Z')
  },

  authenticationOk() {
    return new BufferList().addInt32(0).join(true, 'R')
  },

  authenticationCleartextPassword() {
    return new BufferList().addInt32(3).join(true, 'R')
  },

  authenticationMD5Password() {
    return new BufferList()
      .addInt32(5)
      .add(Buffer.from([1, 2, 3, 4]))
      .join(true, 'R')
  },

  authenticationSASL() {
    return new BufferList().addInt32(10).addCString('SCRAM-SHA-256').addCString('').join(true, 'R')
  },

  authenticationSASLContinue() {
    return new BufferList().addInt32(11).addString('data').join(true, 'R')
  },

  authenticationSASLFinal() {
    return new BufferList().addInt32(12).addString('data').join(true, 'R')
  },

  parameterStatus(name: string, value: string) {
    return new BufferList().addCString(name).addCString(value).join(true, 'S')
  },

  backendKeyData(processID: number, secretKey: number) {
    return new BufferList().addInt32(processID).addInt32(secretKey).join(true, 'K')
  },

  commandComplete(string: string) {
    return new BufferList().addCString(string).join(true, 'C')
  },

  rowDescription(fields: any[]) {
    fields = fields || []
    const buf = new BufferList()
    buf.addInt16(fields.length)
    fields.forEach((field) => {
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

  parameterDescription(dataTypeIDs: number[]) {
    dataTypeIDs = dataTypeIDs || []
    const buf = new BufferList()
    buf.addInt16(dataTypeIDs.length)
    dataTypeIDs.forEach((dataTypeID) => {
      buf.addInt32(dataTypeID)
    })
    return buf.join(true, 't')
  },

  dataRow(columns: any[]) {
    columns = columns || []
    const buf = new BufferList()
    buf.addInt16(columns.length)
    columns.forEach((col) => {
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

  error(fields: any) {
    return buffers.errorOrNotice(fields).join(true, 'E')
  },

  notice(fields: any) {
    return buffers.errorOrNotice(fields).join(true, 'N')
  },

  errorOrNotice(fields: any) {
    fields = fields || []
    const buf = new BufferList()
    fields.forEach((field: any) => {
      buf.addChar(field.type)
      buf.addCString(field.value)
    })
    return buf.add(Buffer.from([0]))
  },

  parseComplete() {
    return new BufferList().join(true, '1')
  },

  bindComplete() {
    return new BufferList().join(true, '2')
  },

  notification(id: number, channel: string, payload: string) {
    return new BufferList().addInt32(id).addCString(channel).addCString(payload).join(true, 'A')
  },

  emptyQuery() {
    return new BufferList().join(true, 'I')
  },

  portalSuspended() {
    return new BufferList().join(true, 's')
  },

  closeComplete() {
    return new BufferList().join(true, '3')
  },

  copyIn(cols: number) {
    const list = new BufferList().addByte(0).addInt16(cols)
    for (let i = 0; i < cols; i++) {
      list.addInt16(i)
    }
    return list.join(true, 'G')
  },

  copyOut(cols: number) {
    const list = new BufferList().addByte(0).addInt16(cols)
    for (let i = 0; i < cols; i++) {
      list.addInt16(i)
    }
    return list.join(true, 'H')
  },

  copyData(bytes: Buffer) {
    return new BufferList().add(bytes).join(true, 'd')
  },

  copyDone() {
    return new BufferList().join(true, 'c')
  },
}

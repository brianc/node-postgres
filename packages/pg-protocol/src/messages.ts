export type Mode = 'text' | 'binary';

export const enum MessageName {
  parseComplete = 'parseComplete',
  bindComplete = 'bindComplete',
  closeComplete = 'closeComplete',
  noData = 'noData',
  portalSuspended = 'portalSuspended',
  replicationStart = 'replicationStart',
  emptyQuery = 'emptyQuery',
  copyDone = 'copyDone',
  copyData = 'copyData',
  rowDescription = 'rowDescription',
  parameterStatus = 'parameterStatus',
  backendKeyData = 'backendKeyData',
  notification = 'notification',
  readyForQuery = 'readyForQuery',
  commandComplete = 'commandComplete',
  dataRow = 'dataRow',
  copyInResponse = 'copyInResponse',
  copyOutResponse = 'copyOutResponse',
  authenticationOk = 'authenticationOk',
  authenticationMD5Password = 'authenticationMD5Password',
  authenticationCleartextPassword = 'authenticationCleartextPassword',
  authenticationSASL = 'authenticationSASL',
  authenticationSASLContinue = 'authenticationSASLContinue',
  authenticationSASLFinal = 'authenticationSASLFinal',
  error = 'error',
  notice = 'notice',
}

export interface BackendMessage {
  name: MessageName;
  length: number;
}

export const parseComplete: BackendMessage = {
  name: MessageName.parseComplete,
  length: 5,
};

export const bindComplete: BackendMessage = {
  name: MessageName.bindComplete,
  length: 5,
}

export const closeComplete: BackendMessage = {
  name: MessageName.closeComplete,
  length: 5,
}

export const noData: BackendMessage = {
  name: MessageName.noData,
  length: 5
}

export const portalSuspended: BackendMessage = {
  name: MessageName.portalSuspended,
  length: 5,
}

export const replicationStart: BackendMessage = {
  name: MessageName.replicationStart,
  length: 4,
}

export const emptyQuery: BackendMessage = {
  name: MessageName.emptyQuery,
  length: 4,
}

export const copyDone: BackendMessage = {
  name: MessageName.copyDone,
  length: 4,
}

interface NoticeOrError {
  message: string | undefined;
  severity: string | undefined;
  code: string | undefined;
  detail: string | undefined;
  hint: string | undefined;
  position: string | undefined;
  internalPosition: string | undefined;
  internalQuery: string | undefined;
  where: string | undefined;
  schema: string | undefined;
  table: string | undefined;
  column: string | undefined;
  dataType: string | undefined;
  constraint: string | undefined;
  file: string | undefined;
  line: string | undefined;
  routine: string | undefined;
}

export class DatabaseError extends Error implements NoticeOrError {
  public severity: string | undefined;
  public code: string | undefined;
  public detail: string | undefined;
  public hint: string | undefined;
  public position: string | undefined;
  public internalPosition: string | undefined;
  public internalQuery: string | undefined;
  public where: string | undefined;
  public schema: string | undefined;
  public table: string | undefined;
  public column: string | undefined;
  public dataType: string | undefined;
  public constraint: string | undefined;
  public file: string | undefined;
  public line: string | undefined;
  public routine: string | undefined;
  constructor(message: string, public readonly length: number, public readonly name: MessageName) {
    super(message)
  }
}

export class CopyDataMessage {
  public readonly name = MessageName.copyData;
  constructor(public readonly length: number, public readonly chunk: Buffer) {

  }
}

export class CopyResponse {
  public readonly columnTypes: number[];
  constructor(public readonly length: number, public readonly name: MessageName, public readonly binary: boolean, columnCount: number) {
    this.columnTypes = new Array(columnCount);
  }
}

export class Field {
  constructor(public readonly name: string, public readonly tableID: number, public readonly columnID: number, public readonly dataTypeID: number, public readonly dataTypeSize: number, public readonly dataTypeModifier: number, public readonly format: Mode) {
  }
}

export class RowDescriptionMessage {
  public readonly name: MessageName = MessageName.rowDescription;
  public readonly fields: Field[];
  constructor(public readonly length: number, public readonly fieldCount: number) {
    this.fields = new Array(this.fieldCount)
  }
}

export class ParameterStatusMessage {
  public readonly name: MessageName = MessageName.parameterStatus;
  constructor(public readonly length: number, public readonly parameterName: string, public readonly parameterValue: string) {

  }
}

export class AuthenticationMD5Password implements BackendMessage {
  public readonly name: MessageName = MessageName.authenticationMD5Password;
  constructor(public readonly length: number, public readonly salt: Buffer) {
  }
}

export class BackendKeyDataMessage {
  public readonly name: MessageName = MessageName.backendKeyData;
  constructor(public readonly length: number, public readonly processID: number, public readonly secretKey: number) {
  }
}

export class NotificationResponseMessage {
  public readonly name: MessageName = MessageName.notification;
  constructor(public readonly length: number, public readonly processId: number, public readonly channel: string, public readonly payload: string) {
  }
}

export class ReadyForQueryMessage {
  public readonly name: MessageName = MessageName.readyForQuery;
  constructor(public readonly length: number, public readonly status: string) {
  }
}

export class CommandCompleteMessage {
  public readonly name: MessageName = MessageName.commandComplete
  constructor(public readonly length: number, public readonly text: string) {
  }
}

export class DataRowMessage {
  public readonly fieldCount: number;
  public readonly name: MessageName = MessageName.dataRow
  constructor(public length: number, public fields: any[]) {
    this.fieldCount = fields.length;
  }
}

export class NoticeMessage implements BackendMessage, NoticeOrError {
  constructor(public readonly length: number, public readonly message: string | undefined) {}
  public readonly name = MessageName.notice;
  public severity: string | undefined;
  public code: string | undefined;
  public detail: string | undefined;
  public hint: string | undefined;
  public position: string | undefined;
  public internalPosition: string | undefined;
  public internalQuery: string | undefined;
  public where: string | undefined;
  public schema: string | undefined;
  public table: string | undefined;
  public column: string | undefined;
  public dataType: string | undefined;
  public constraint: string | undefined;
  public file: string | undefined;
  public line: string | undefined;
  public routine: string | undefined;
}

export type Mode = 'text' | 'binary';

export type BackendMessage = {
  name: string;
  length: number;
}

export const parseComplete: BackendMessage = {
  name: 'parseComplete',
  length: 5,
};

export const bindComplete: BackendMessage = {
  name: 'bindComplete',
  length: 5,
}

export const closeComplete: BackendMessage = {
  name: 'closeComplete',
  length: 5,
}

export const noData: BackendMessage = {
  name: 'noData',
  length: 5
}

export const portalSuspended: BackendMessage = {
  name: 'portalSuspended',
  length: 5,
}

export const replicationStart: BackendMessage = {
  name: 'replicationStart',
  length: 4,
}

export const emptyQuery: BackendMessage = {
  name: 'emptyQuery',
  length: 4,
}

export const copyDone: BackendMessage = {
  name: 'copyDone',
  length: 4,
}

export class DatabaseError extends Error {
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
  constructor(message: string, public readonly length: number, public readonly name: string) {
    super(message)
  }
}

export class CopyDataMessage {
  public readonly name = 'copyData';
  constructor(public readonly length: number, public readonly chunk: Buffer) {

  }
}

export class CopyResponse {
  public readonly columnTypes: number[];
  constructor(public readonly length: number, public readonly name: string, public readonly binary: boolean, columnCount: number) {
    this.columnTypes = new Array(columnCount);
  }
}

export class Field {
  constructor(public readonly name: string, public readonly tableID: number, public readonly columnID: number, public readonly dataTypeID: number, public readonly dataTypeSize: number, public readonly dataTypeModifier: number, public readonly format: Mode) {
  }
}

export class RowDescriptionMessage {
  public readonly name: string = 'rowDescription';
  public readonly fields: Field[];
  constructor(public readonly length: number, public readonly fieldCount: number) {
    this.fields = new Array(this.fieldCount)
  }
}

export class ParameterStatusMessage {
  public readonly name: string = 'parameterStatus';
  constructor(public readonly length: number, public readonly parameterName: string, public readonly parameterValue: string) {

  }
}

export class BackendKeyDataMessage {
  public readonly name: string = 'backendKeyData';
  constructor(public readonly length: number, public readonly processID: number, public readonly secretKey: number) {
  }
}

export class NotificationResponseMessage {
  public readonly name: string = 'notification';
  constructor(public readonly length: number, public readonly processId: number, public readonly channel: string, public readonly payload: string) {
  }
}

export class ReadyForQueryMessage {
  public readonly name: string = 'readyForQuery';
  constructor(public readonly length: number, public readonly status: string) {
  }
}

export class CommandCompleteMessage {
  public readonly name: string = 'commandComplete'
  constructor(public readonly length: number, public readonly text: string) {
  }
}

export class DataRowMessage {
  public readonly fieldCount: number;
  public readonly name: string = 'dataRow'
  constructor(public length: number, public fields: any[]) {
    this.fieldCount = fields.length;
  }
}

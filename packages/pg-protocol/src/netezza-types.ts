/**
 * Netezza DBOS Type Definitions
 */

// Netezza data types
export const NzTypeRecAddr = 1
export const NzTypeDouble = 2
export const NzTypeInt = 3 // INT32
export const NzTypeFloat = 4
export const NzTypeMoney = 5
export const NzTypeDate = 6
export const NzTypeNumeric = 7
export const NzTypeTime = 8
export const NzTypeTimestamp = 9
export const NzTypeInterval = 10
export const NzTypeTimeTz = 11
export const NzTypeBool = 12
export const NzTypeInt1 = 13 // INT8
export const NzTypeBinary = 14
export const NzTypeChar = 15
export const NzTypeVarChar = 16
export const NzTypeUnknown = 18
export const NzTypeInt2 = 19 // INT16
export const NzTypeInt8 = 20 // INT64
export const NzTypeVarFixedChar = 21
export const NzTypeGeometry = 22
export const NzTypeVarBinary = 23
export const NzTypeNChar = 25
export const NzTypeNVarChar = 26
export const NzTypeJson = 30
export const NzTypeJsonb = 31
export const NzTypeJsonpath = 32
export const NzTypeVector = 33

/**
 * DBOS Tuple Descriptor
 * Describes the structure of DBOS data tuples
 */
export class DbosTupleDesc {
  version: number = 0
  nullsAllowed: number = 0
  sizeWord: number = 0
  sizeWordSize: number = 0
  numFixedFields: number = 0
  numVaryingFields: number = 0
  fixedFieldsSize: number = 0
  maxRecordSize: number = 0
  numFields: number = 0
  field_type: number[] = []
  field_size: number[] = []
  field_trueSize: number[] = []
  field_offset: number[] = []
  field_physField: number[] = []
  field_logField: number[] = []
  field_nullAllowed: number[] = []
  field_fixedSize: number[] = []
  field_springField: number[] = []
  DateStyle: number = 0
  EuroDates: number = 0
  DBcharset: number = 0
  EnableTime24: number = 0
}

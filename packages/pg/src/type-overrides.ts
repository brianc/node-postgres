import * as types from 'pg-types'

import type { TypeFormat, TypeParser } from 'pg-types'

type ParserMap = Record<number, TypeParser>

interface TypesLike {
  getTypeParser(oid: number, format?: TypeFormat): TypeParser
  setTypeParser?(oid: number, format: TypeFormat, parser: TypeParser): void
}

class TypeOverrides {
  _types: TypesLike
  text: ParserMap
  binary: ParserMap

  constructor(userTypes?: TypesLike) {
    this._types = userTypes || (types as unknown as TypesLike)
    this.text = {}
    this.binary = {}
  }

  getOverrides(format: TypeFormat | string): ParserMap {
    switch (format) {
      case 'text':
        return this.text
      case 'binary':
        return this.binary
      default:
        return {}
    }
  }

  setTypeParser(oid: number, format: TypeFormat | TypeParser, parseFn?: TypeParser): void {
    if (typeof format === 'function') {
      parseFn = format
      format = 'text'
    }
    this.getOverrides(format)[oid] = parseFn as TypeParser
  }

  getTypeParser(oid: number, format?: TypeFormat | string): TypeParser {
    const fmt = (format || 'text') as TypeFormat
    return this.getOverrides(fmt)[oid] || this._types.getTypeParser(oid, fmt)
  }
}

export default TypeOverrides
export { TypeOverrides }

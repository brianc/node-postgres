import { QueryResult, types } from 'pg';

interface CursorQueryConfig {
  // by default rows come out as a key/value pair for each row
  // pass the string 'array' here to receive rows as an array of values
  rowMode?: string;
  // custom type parsers just for this query result
  types?: {
    getTypeParser: typeof types.getTypeParser;
  };
}

export class Cursor {
  constructor(text: string, values: any[], config?: CursorQueryConfig);
  read(rowCount: number, callback: (err: Error | null, rows: any[], result: QueryResult) => void): void;
  close(callback: () => void): void;
}

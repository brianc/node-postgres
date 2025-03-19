// ESM wrapper for pg-connection-string
import connectionString from '../index.js';

// Re-export the parse function
export const parse = connectionString.parse;

// Re-export the default
export default connectionString; 
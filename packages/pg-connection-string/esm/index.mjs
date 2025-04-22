// ESM wrapper for pg-connection-string
import connectionString from '../index.js'

// Re-export the parse function
export const parse = connectionString.parse
export const toClientConfig = connectionString.toClientConfig
export const parseIntoClientConfig = connectionString.parseIntoClientConfig

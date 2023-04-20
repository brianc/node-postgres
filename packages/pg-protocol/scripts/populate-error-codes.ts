import fetch from 'node-fetch'
import { writeFileSync } from 'fs'
import { join } from 'path'

const ErrorRegexp = /(.*[A-Z0-9]{5}) +[A-Z] +ERRCODE_([A-Z_]+) .*/g

const main = async () => {
  const result = await fetch(
    'https://raw.githubusercontent.com/postgres/postgres/master/src/backend/utils/errcodes.txt'
  ).then((res) => res.text())
  const codes = result
    .split('\n')
    .filter((x) => x.match(ErrorRegexp))
    .map((line) => {
      const parsedLine = line.replace(ErrorRegexp, ($0, $1, $2) => `${$1}:${$2}`).split(':')
      return { code: parsedLine[0], condition: parsedLine[1] }
    })
  let exportString = `export const POSTGRES_ERRORS_BY_CODE = {\n${codes
    .map(({ code, condition }) => `  ${wrapInQuotesIfNeeded(code)}: '${condition}'`)
    .join(',\n')},\n} as const\n\n`
  exportString = `${exportString}export const POSTGRES_ERRORS = {\n${codes
    .map(({ code, condition }) => `  ${condition}: '${code}'`)
    .join(',\n')},\n} as const\n`
  exportString += `\nexport type PgErrorCondition = keyof typeof POSTGRES_ERRORS\nexport type PgErrorCode = typeof POSTGRES_ERRORS[PgErrorCondition]\n`
  writeFileSync(join(__dirname, '..', 'src', 'postgres-error-codes.ts'), exportString)
}

const wrapInQuotesIfNeeded = (str: string) => {
  return str.match(/^[0-9]/) ? `'${str}'` : str
}

main()

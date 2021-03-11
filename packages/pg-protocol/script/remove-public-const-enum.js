// This task would be better served by recast or something like that.
// https://github.com/travellocal/babel-plugin-declare-const-enum is a good starting point for that.

const fs = require('fs')
const path = require('path')

const filepath = path.join(__dirname, '../dist/messages.d.ts')
const backuppath = path.join(__dirname, '../dist/messages.const-enum.d.ts')
/** @type {string} */
let srcpath
// use the filepath if it's newer
try {
  const backupStat = fs.statSync(backuppath)
  const fileStat = fs.statSync(filepath)
  srcpath = fileStat.mtimeMs > backupStat.mtimeMs ? filepath : backuppath
} catch (err) {
  if (err.code !== 'ENOENT') {
    throw err
  }
  srcpath = filepath
}
const src = fs.readFileSync(srcpath, 'utf8')
if (srcpath === filepath) {
  fs.writeFileSync(backuppath, src, 'utf8')
}

/** @type {({startIndex: number, endIndex: number, content: string})[]} */
let replacements = []

// find the const enum declarations
const startRe = /(^|\n)export declare const enum ([A-Za-z][A-Za-z0-9]+) \{\n*/g
const endRe = /\n\}/g

const constEnums = {}

/** @type {RegExpExecArray | null} */
let match
while ((match = startRe.exec(src))) {
  const startIndex = match.index
  const name = match[2]
  const contentStartIndex = (endRe.lastIndex = startRe.lastIndex)
  const end = endRe.exec(src)
  if (!end) break
  const contentEndIndex = end.index
  const endIndex = (startRe.lastIndex = endRe.lastIndex)

  // collect the members of the const enum
  const constEnumContent = src.slice(contentStartIndex, contentEndIndex)
  const itemRe = /\b([A-Za-z][A-Za-z0-9]+)\s*=\s*(.+),/g
  const lastRe = /\b([A-Za-z][A-Za-z0-9]+)\s*=\s*(.+)/g

  const enumItems = (constEnums[name] = {})
  const enumValueLiterals = []

  /** @type {RegExpExecArray | null} */
  let itemMatch
  while ((itemMatch = itemRe.exec(constEnumContent))) {
    enumValueLiterals.push((enumItems[itemMatch[1]] = itemMatch[2]))
    lastRe.lastIndex = itemRe.lastIndex
  }
  itemMatch = lastRe.exec(constEnumContent)
  if (itemMatch) {
    enumValueLiterals.push((enumItems[itemMatch[1]] = itemMatch[2]))
  }

  replacements.push({
    startIndex,
    endIndex,
    content: `${match[1]}export type ${name} =\n${enumValueLiterals.map((s) => `    | ${s}`).join('\n')};`,
  })
}

if (replacements.length > 0) {
  // replace the const enum declarations with a literal type union
  let out = replacements
    .sort((a, b) => a.startIndex - b.startIndex)
    .reduce((out, { endIndex, content }, i, r) => {
      const next = r[i + 1]
      return out + content + src.slice(endIndex, next && next.startIndex)
    }, src.slice(0, replacements[0].startIndex))

  // replace references to the enum with the literals
  for (const enumName of Object.keys(constEnums)) {
    const enumItems = constEnums[enumName]
    const re = new RegExp(`\\b${enumName}\\.(${Object.keys(enumItems).join('|')})\\b`, 'g')

    out = out.replace(re, (s, enumItemName) => enumItems[enumItemName])
  }

  fs.writeFileSync(filepath, out, 'utf8')
  const now = new Date()
  fs.utimesSync(backuppath, now, now)
}

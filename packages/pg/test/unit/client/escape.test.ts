import assert from 'node:assert'

import { describe, it } from 'vitest'

import * as utils from '../../../src/utils.ts'
import { Client, config } from '../../_test-helper.ts'

const litCases: Array<[string, string, string]> = [
  ['no special characters', 'hello world', "'hello world'"],
  ['contains double quotes only', 'hello " world', "'hello \" world'"],
  ['contains single quotes only', "hello ' world", "'hello '' world'"],
  ['contains backslashes only', 'hello \\ world', " E'hello \\\\ world'"],
  ['contains single quotes and double quotes', 'hello \' " world', "'hello '' \" world'"],
  ['contains double quotes and backslashes', 'hello \\ " world', " E'hello \\\\ \" world'"],
  ['contains single quotes and backslashes', "hello \\ ' world", " E'hello \\\\ '' world'"],
  ['contains single quotes, double quotes, and backslashes', 'hello \\ \' " world', " E'hello \\\\ '' \" world'"],
]

const identCases: Array<[string, string, string]> = [
  ['no special characters', 'hello world', '"hello world"'],
  ['contains double quotes only', 'hello " world', '"hello "" world"'],
  ['contains single quotes only', "hello ' world", '"hello \' world"'],
  ['contains backslashes only', 'hello \\ world', '"hello \\ world"'],
  ['contains single quotes and double quotes', 'hello \' " world', '"hello \' "" world"'],
  ['contains double quotes and backslashes', 'hello \\ " world', '"hello \\ "" world"'],
  ['contains single quotes and backslashes', "hello \\ ' world", '"hello \\ \' world"'],
  ['contains single quotes, double quotes, and backslashes', 'hello \\ \' " world', '"hello \\ \' "" world"'],
]

describe('escapeLiteral', () => {
  for (const [name, input, expected] of litCases) {
    it(`Client#escapeLiteral: ${name}`, () => {
      const client = new Client(config)
      assert.equal(client.escapeLiteral(input), expected)
    })
    it(`Client.prototype.escapeLiteral: ${name}`, () => {
      assert.equal(Client.prototype.escapeLiteral(input), expected)
    })
    it(`utils.escapeLiteral: ${name}`, () => {
      assert.equal(utils.escapeLiteral(input), expected)
    })
  }
})

describe('escapeIdentifier', () => {
  for (const [name, input, expected] of identCases) {
    it(`Client#escapeIdentifier: ${name}`, () => {
      const client = new Client(config)
      assert.equal(client.escapeIdentifier(input), expected)
    })
    it(`Client.prototype.escapeIdentifier: ${name}`, () => {
      assert.equal(Client.prototype.escapeIdentifier(input), expected)
    })
    it(`utils.escapeIdentifier: ${name}`, () => {
      assert.equal(utils.escapeIdentifier(input), expected)
    })
  }
})

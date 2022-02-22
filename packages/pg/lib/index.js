'use strict'

var Client = require('./client')
var defaults = require('./defaults')
var Connection = require('./connection')
var Pool = require('pg-pool')
var Cursor = require('pg-cursor')
const { DatabaseError } = require('pg-protocol')
require("setimmediate")

const poolFactory = (Client) => {
  return class BoundPool extends Pool {
    constructor(options) {
      super(options, Client)
    }
  }
}

var PG = function (clientConstructor) {
  this.defaults = defaults
  this.Client = clientConstructor
  this.Query = this.Client.Query
  this.Pool = poolFactory(this.Client)
  this.Cursor = Cursor
  this._pools = []
  this.Connection = Connection
  this.types = require('pg-types')
  this.DatabaseError = DatabaseError
}

module.exports = new PG(Client)

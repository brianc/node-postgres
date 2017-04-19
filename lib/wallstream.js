/**
 * Copyright (c) 2017 Kibae Shin (nonunnet@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */
var EventEmitter = require('events').EventEmitter;
var Client = require('./client');
var util = require('util');

var WalStream = function(config) {
  EventEmitter.call(this);

  var c = config || {};
  c.replication = 'database';

  var self = this;

  var client;
  var stoped = false;
  this.getChanges = function(slotName, uptoLsn, option, cb /*(err)*/) {
    option = option || {};
    /*
     * includeXids : include xid on BEGIN and COMMIT, default false
     * includeTimestamp : include timestamp on COMMIT, default false
     * skipEmptyXacts : skip empty transaction like DDL, default true
     */

    stoped = false;
    client = new Client(config);

    client.on('error', function(err) {
      self.emit('error', err);
    });

    client.connect(function(err) {
      //error handling
      if (err) {
        self.emit('error', err);
        return;
      }

      var sql = 'START_REPLICATION SLOT ' + slotName + ' LOGICAL ' + (uptoLsn ? uptoLsn : '0/00000000');
      var opts = [
        '"include-xids" \'' + (option.includeXids === true ? 'on' : 'off') + '\'',
        '"include-timestamp" \'' + (option.includeTimestamp === true ? 'on' : 'off') + '\'',
        '"skip-empty-xacts" \'' + (option.skipEmptyXacts !== false ? 'on' : 'off') + '\'',
      ];
      sql += ' (' + (opts.join(' , ')) + ')';

      client.query(sql, function(err) {
        if (err) {
          if (!stoped && cb) {
            cb(err);
            cb = null;
          }
        }
        cb = null;
      });

      client.connection.once('replicationStart', function() {
        //start
        self.emit('start', self);
        client.connection.on('copyData', function(msg) {
          if (msg.chunk[0] != 0x77) {
            return;
          }

          var lsn = (msg.chunk.readUInt32BE(1).toString(16).toUpperCase()) + '/' + (msg.chunk.readUInt32BE(5).toString(16).toUpperCase());
          self.emit('data', {
            lsn: lsn,
            log: msg.chunk.slice(25),
          });
        });
      });
    });
    return self;
  };

  this.stop = function() {
    stoped = true;
    if (client) {
      client.end();
      client = null;
    }
  };
};

util.inherits(WalStream, EventEmitter);

module.exports = WalStream;

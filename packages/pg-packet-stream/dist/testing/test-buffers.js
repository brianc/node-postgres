"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// http://developer.postgresql.org/pgdocs/postgres/protocol-message-formats.html
const buffer_list_1 = __importDefault(require("./buffer-list"));
const buffers = {
    readyForQuery: function () {
        return new buffer_list_1.default()
            .add(Buffer.from('I'))
            .join(true, 'Z');
    },
    authenticationOk: function () {
        return new buffer_list_1.default()
            .addInt32(0)
            .join(true, 'R');
    },
    authenticationCleartextPassword: function () {
        return new buffer_list_1.default()
            .addInt32(3)
            .join(true, 'R');
    },
    authenticationMD5Password: function () {
        return new buffer_list_1.default()
            .addInt32(5)
            .add(Buffer.from([1, 2, 3, 4]))
            .join(true, 'R');
    },
    authenticationSASL: function () {
        return new buffer_list_1.default()
            .addInt32(10)
            .addCString('SCRAM-SHA-256')
            .addCString('')
            .join(true, 'R');
    },
    authenticationSASLContinue: function () {
        return new buffer_list_1.default()
            .addInt32(11)
            .addString('data')
            .join(true, 'R');
    },
    authenticationSASLFinal: function () {
        return new buffer_list_1.default()
            .addInt32(12)
            .addString('data')
            .join(true, 'R');
    },
    parameterStatus: function (name, value) {
        return new buffer_list_1.default()
            .addCString(name)
            .addCString(value)
            .join(true, 'S');
    },
    backendKeyData: function (processID, secretKey) {
        return new buffer_list_1.default()
            .addInt32(processID)
            .addInt32(secretKey)
            .join(true, 'K');
    },
    commandComplete: function (string) {
        return new buffer_list_1.default()
            .addCString(string)
            .join(true, 'C');
    },
    rowDescription: function (fields) {
        fields = fields || [];
        var buf = new buffer_list_1.default();
        buf.addInt16(fields.length);
        fields.forEach(function (field) {
            buf.addCString(field.name)
                .addInt32(field.tableID || 0)
                .addInt16(field.attributeNumber || 0)
                .addInt32(field.dataTypeID || 0)
                .addInt16(field.dataTypeSize || 0)
                .addInt32(field.typeModifier || 0)
                .addInt16(field.formatCode || 0);
        });
        return buf.join(true, 'T');
    },
    dataRow: function (columns) {
        columns = columns || [];
        var buf = new buffer_list_1.default();
        buf.addInt16(columns.length);
        columns.forEach(function (col) {
            if (col == null) {
                buf.addInt32(-1);
            }
            else {
                var strBuf = Buffer.from(col, 'utf8');
                buf.addInt32(strBuf.length);
                buf.add(strBuf);
            }
        });
        return buf.join(true, 'D');
    },
    error: function (fields) {
        return buffers.errorOrNotice(fields).join(true, 'E');
    },
    notice: function (fields) {
        return buffers.errorOrNotice(fields).join(true, 'N');
    },
    errorOrNotice: function (fields) {
        fields = fields || [];
        var buf = new buffer_list_1.default();
        fields.forEach(function (field) {
            buf.addChar(field.type);
            buf.addCString(field.value);
        });
        return buf.add(Buffer.from([0])); // terminator
    },
    parseComplete: function () {
        return new buffer_list_1.default().join(true, '1');
    },
    bindComplete: function () {
        return new buffer_list_1.default().join(true, '2');
    },
    notification: function (id, channel, payload) {
        return new buffer_list_1.default()
            .addInt32(id)
            .addCString(channel)
            .addCString(payload)
            .join(true, 'A');
    },
    emptyQuery: function () {
        return new buffer_list_1.default().join(true, 'I');
    },
    portalSuspended: function () {
        return new buffer_list_1.default().join(true, 's');
    },
    closeComplete: function () {
        return new buffer_list_1.default().join(true, '3');
    },
    copyIn: function (cols) {
        const list = new buffer_list_1.default()
            // text mode
            .addByte(0)
            // column count
            .addInt16(cols);
        for (let i = 0; i < cols; i++) {
            list.addInt16(i);
        }
        return list.join(true, 'G');
    },
    copyOut: function (cols) {
        const list = new buffer_list_1.default()
            // text mode
            .addByte(0)
            // column count
            .addInt16(cols);
        for (let i = 0; i < cols; i++) {
            list.addInt16(i);
        }
        return list.join(true, 'H');
    },
    copyData: function (bytes) {
        return new buffer_list_1.default().add(bytes).join(true, 'd');
    },
    copyDone: function () {
        return new buffer_list_1.default().join(true, 'c');
    }
};
exports.default = buffers;
//# sourceMappingURL=test-buffers.js.map
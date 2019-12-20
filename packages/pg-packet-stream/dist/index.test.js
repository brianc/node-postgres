"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const _1 = require("./");
const chai_1 = require("chai");
const chunky_1 = __importDefault(require("chunky"));
const consume = (stream, count) => __awaiter(void 0, void 0, void 0, function* () {
    const result = [];
    return new Promise((resolve) => {
        const read = () => {
            stream.once('readable', () => {
                let packet;
                while (packet = stream.read()) {
                    result.push(packet);
                }
                if (result.length === count) {
                    resolve(result);
                }
                else {
                    read();
                }
            });
        };
        read();
    });
});
const emptyMessage = Buffer.from([0x0a, 0x00, 0x00, 0x00, 0x04]);
const oneByteMessage = Buffer.from([0x0b, 0x00, 0x00, 0x00, 0x05, 0x0a]);
const bigMessage = Buffer.from([0x0f, 0x00, 0x00, 0x00, 0x14, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e0, 0x0f]);
describe.skip('PgPacketStream', () => {
    it('should chunk a perfect input packet', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x04]));
        stream.end();
        const buffers = yield consume(stream, 1);
        chai_1.expect(buffers).to.have.length(1);
        chai_1.expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]));
    }));
    it('should read 2 chunks into perfect input packet', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x08]));
        stream.write(Buffer.from([0x1, 0x2, 0x3, 0x4]));
        stream.end();
        const buffers = yield consume(stream, 1);
        chai_1.expect(buffers).to.have.length(1);
        chai_1.expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x08, 0x1, 0x2, 0x3, 0x4]));
    }));
    it('should read a bunch of big messages', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        let totalBuffer = Buffer.allocUnsafe(0);
        const num = 2;
        for (let i = 0; i < 2; i++) {
            totalBuffer = Buffer.concat([totalBuffer, bigMessage, bigMessage]);
        }
        const chunks = chunky_1.default(totalBuffer);
        for (const chunk of chunks) {
            stream.write(chunk);
        }
        stream.end();
        const messages = yield consume(stream, num * 2);
        chai_1.expect(messages.map(x => x.code)).to.eql(new Array(num * 2).fill(0x0f));
    }));
    it('should read multiple messages in a single chunk', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04]));
        stream.end();
        const buffers = yield consume(stream, 2);
        chai_1.expect(buffers).to.have.length(2);
        chai_1.expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]));
        chai_1.expect(buffers[1].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x04]));
    }));
    it('should read multiple chunks into multiple packets', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        stream.write(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x05, 0x0a, 0x01, 0x00, 0x00, 0x00, 0x05, 0x0b]));
        stream.write(Buffer.from([0x01, 0x00, 0x00]));
        stream.write(Buffer.from([0x00, 0x06, 0x0c, 0x0d, 0x03, 0x00, 0x00, 0x00, 0x04]));
        stream.end();
        const buffers = yield consume(stream, 4);
        chai_1.expect(buffers).to.have.length(4);
        chai_1.expect(buffers[0].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x05, 0x0a]));
        chai_1.expect(buffers[1].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x05, 0x0b]));
        chai_1.expect(buffers[2].packet).to.deep.equal(Buffer.from([0x1, 0x00, 0x00, 0x00, 0x06, 0x0c, 0x0d]));
        chai_1.expect(buffers[3].packet).to.deep.equal(Buffer.from([0x3, 0x00, 0x00, 0x00, 0x04]));
    }));
    it('reads packet that spans multiple chunks', () => __awaiter(void 0, void 0, void 0, function* () {
        const stream = new _1.PgPacketStream();
        stream.write(Buffer.from([0x0d, 0x00, 0x00, 0x00]));
        stream.write(Buffer.from([0x09])); // length
        stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]));
        stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]));
        stream.write(Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]));
        stream.end();
        const buffers = yield consume(stream, 1);
        chai_1.expect(buffers).to.have.length(1);
    }));
});
//# sourceMappingURL=index.test.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class BufferList {
    constructor(buffers = []) {
        this.buffers = buffers;
    }
    add(buffer, front) {
        this.buffers[front ? 'unshift' : 'push'](buffer);
        return this;
    }
    addInt16(val, front) {
        return this.add(Buffer.from([(val >>> 8), (val >>> 0)]), front);
    }
    getByteLength(initial) {
        return this.buffers.reduce(function (previous, current) {
            return previous + current.length;
        }, initial || 0);
    }
    addInt32(val, first) {
        return this.add(Buffer.from([
            (val >>> 24 & 0xFF),
            (val >>> 16 & 0xFF),
            (val >>> 8 & 0xFF),
            (val >>> 0 & 0xFF)
        ]), first);
    }
    addCString(val, front) {
        var len = Buffer.byteLength(val);
        var buffer = Buffer.alloc(len + 1);
        buffer.write(val);
        buffer[len] = 0;
        return this.add(buffer, front);
    }
    addString(val, front) {
        var len = Buffer.byteLength(val);
        var buffer = Buffer.alloc(len);
        buffer.write(val);
        return this.add(buffer, front);
    }
    addChar(char, first) {
        return this.add(Buffer.from(char, 'utf8'), first);
    }
    addByte(byte) {
        return this.add(Buffer.from([byte]));
    }
    join(appendLength, char) {
        var length = this.getByteLength();
        if (appendLength) {
            this.addInt32(length + 4, true);
            return this.join(false, char);
        }
        if (char) {
            this.addChar(char, true);
            length++;
        }
        var result = Buffer.alloc(length);
        var index = 0;
        this.buffers.forEach(function (buffer) {
            buffer.copy(result, index, 0);
            index += buffer.length;
        });
        return result;
    }
    static concat() {
        var total = new BufferList();
        for (var i = 0; i < arguments.length; i++) {
            total.add(arguments[i]);
        }
        return total.join();
    }
}
exports.default = BufferList;
//# sourceMappingURL=buffer-list.js.map
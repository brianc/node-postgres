//binary data writer tuned for creating
//postgres message packets as effeciently as possible by reusing the
//same buffer to avoid memcpy and limit memory allocations

export class Writer {
  private buffer: Buffer;
  private offset: number = 5;
  private headerPosition: number = 0;
  private readonly encoding = 'utf-8';
  constructor(size: number = 1024) {
    this.buffer = Buffer.alloc(size + 5)
  }

  private _ensure(size: number): void {
    var remaining = this.buffer.length - this.offset;
    if (remaining < size) {
      var oldBuffer = this.buffer;
      // exponential growth factor of around ~ 1.5
      // https://stackoverflow.com/questions/2269063/buffer-growth-strategy
      var newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
      this.buffer = Buffer.alloc(newSize);
      oldBuffer.copy(this.buffer);
    }
  }

  public addInt32(num: number): Writer {
    this._ensure(4);
    this.buffer[this.offset++] = (num >>> 24 & 0xFF);
    this.buffer[this.offset++] = (num >>> 16 & 0xFF);
    this.buffer[this.offset++] = (num >>> 8 & 0xFF);
    this.buffer[this.offset++] = (num >>> 0 & 0xFF);
    return this;
  }

  public addInt16(num: number): Writer {
    this._ensure(2);
    this.buffer[this.offset++] = (num >>> 8 & 0xFF);
    this.buffer[this.offset++] = (num >>> 0 & 0xFF);
    return this;
  }

  public addCString(string: string): Writer {
    //just write a 0 for empty or null strings
    if (!string) {
      this._ensure(1);
    } else {
      var len = Buffer.byteLength(string);
      this._ensure(len + 1); //+1 for null terminator
      this.buffer.write(string, this.offset, this.encoding)
      this.offset += len;
    }

    this.buffer[this.offset++] = 0; // null terminator
    return this;
  }

  // note: this assumes character is 1 byte - used for writing protocol charcodes
  public addChar(c: string): Writer {
    this._ensure(1);
    this.buffer.write(c, this.offset);
    this.offset++;
    return this;
  }

  public addString(string: string = ""): Writer {
    var len = Buffer.byteLength(string);
    this._ensure(len);
    this.buffer.write(string, this.offset);
    this.offset += len;
    return this;
  }

  public getByteLength(): number {
    return this.offset - 5;
  }

  public add(otherBuffer: Buffer): Writer {
    this._ensure(otherBuffer.length);
    otherBuffer.copy(this.buffer, this.offset);
    this.offset += otherBuffer.length;
    return this;
  }

  public clear(): void {
    this.offset = 5;
    this.headerPosition = 0;
  }

  //appends a header block to all the written data since the last
  //subsequent header or to the beginning if there is only one data block
  public addHeader(code: number, last: boolean = false) {
    var origOffset = this.offset;
    this.offset = this.headerPosition;
    this.buffer[this.offset++] = code;
    //length is everything in this packet minus the code
    this.addInt32(origOffset - (this.headerPosition + 1));
    //set next header position
    this.headerPosition = origOffset;
    //make space for next header
    this.offset = origOffset;
    if (!last) {
      this._ensure(5);
      this.offset += 5;
    }
  }

  public join(code?: number): Buffer {
    if (code) {
      this.addHeader(code, true);
    }
    return this.buffer.slice(code ? 0 : 5, this.offset);
  }

  public flush(code?: number): Buffer {
    var result = this.join(code);
    this.clear();
    return result;
  }
}


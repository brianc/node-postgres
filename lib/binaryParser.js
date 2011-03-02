var BinaryParser = function(config) {
    config = config || {};
    this.encoding = config.encoding || 'utf8';
};

var p = BinaryParser.prototype;

var parseBits = function(data, bits, offset, callback) {
    offset = offset || 0;
    callback = callback || function(lastValue, newValue, bits) { return (lastValue * Math.pow(2, bits)) + newValue; };
    var offsetBytes = offset >> 3;

    // read first (maybe partial) byte
    var mask = 0xff;
    var firstBits = 8 - (offset % 8);
    if (bits < firstBits) {
        mask = (0xff << (8 - bits)) & 0xff;
        firstBits = bits;
    }

    if (offset) {
        mask = mask >> (offset % 8);
    }

    var result = 0;
    if ((offset % 8) + bits >= 8) {
        result = callback(0, data[offsetBytes] & mask, firstBits);
    }

    // read bytes
    var bytes = (bits + offset) >> 3;
    for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, data[i], 8);
    }

    // bits to read, that are not a complete byte
    var lastBits = (bits + offset) % 8;
    if (lastBits > 0) {
        result = callback(result, data[bytes] >> (8 - lastBits), lastBits);
    }

    return result;
}

var parseFloat = function(data, precisionBits, exponentBits) {
    var bias = Math.pow(2, exponentBits - 1) - 1;
    var sign = parseBits(data, 1);
    var exponent = parseBits(data, exponentBits, 1);

    if (exponent == 0)
        return 0;

    // parse mantissa
    var precisionBitsCounter = 1;
    var parsePrecisionBits = function(lastValue, newValue, bits) {
        if (lastValue == 0) {
            lastValue = 1;
        }

        for (var i = 1; i <= bits; i++) {
            precisionBitsCounter /= 2;
            if ((newValue & (0x1 << (bits - i))) > 0) {
                lastValue += precisionBitsCounter;
            }
        }

        return lastValue;
    };

    var mantissa = parseBits(data, precisionBits, exponentBits + 1, parsePrecisionBits);

    // special cases
    if (exponent == (Math.pow(2, exponentBits + 1) - 1)) {
        if (mantissa == 0) {
            return (sign == 0) ? Infinity : -Infinity;
        }

        return NaN;
    }

    // normale number
    return ((sign == 0) ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
};

p.parseBool = function(value) {
    return (parseBits(value, 8) == 1);
}

p.parseInt16 = function(value) {
    if (parseBits(value, 1) == 1) {
        return -1 * (Math.pow(2, 15) - parseBits(value, 15, 1));
    }

    return parseBits(value, 15, 1);
}

p.parseInt32 = function(value) {
    if (parseBits(value, 1) == 1) {
        return -1 * (Math.pow(2, 31) - parseBits(value, 31, 1));
    }

    return parseBits(value, 31, 1);
}

p.parseInt64 = function(value) {
    if (parseBits(value, 1) == 1) {
        return -1 * (Math.pow(2, 63) - parseBits(value, 63, 1));
    }

    return parseBits(value, 63, 1);
}

p.parseFloat32 = function(value) {
    return parseFloat(value, 23, 8);
}

p.parseFloat64 = function(value) {
    return parseFloat(value, 52, 11);
}

p.parseNumeric = function(value) {
    var sign = parseBits(value, 16, 32);
    if (sign == 0xc000) {
        return NaN;
    }

    var weight = Math.pow(10000, parseBits(value, 16, 16));
    var result = 0;

    var digits = new Array();
    var ndigits = parseBits(value, 16);
    for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + (16 * i)) * weight;
        weight /= 10000;
    }

    var scale = Math.pow(10, parseBits(value, 16, 48));
    return ((sign == 0) ? 1 : -1) * Math.round(result * scale) / scale;
}

p.parseDate = function(value) {
    var sign = parseBits(value, 1);
    var rawValue = parseBits(value, 63, 1);

    // discard usecs and shift from 2000 to 1970
    var result = new Date((((sign == 0) ? 1 : -1) * rawValue / 1000) + 946684800000);

    // add microseconds to the date
    result.usec = rawValue % 1000;
    result.getMicroSeconds = function() {
        return this.usec;
    };
    result.setMicroSeconds = function(value) {
        this.usec = value;
    };
    result.getUTCMicroSeconds = function() {
        return this.usec;
    };

    return result;
}

p.parseIntArray = p.parseStringArray = function(value) {
    var dim = parseBits(value, 32);

    var flags = parseBits(value, 32, 32);
    var elementType = parseBits(value, 32, 64);

    var offset = 96;
    var dims = new Array();
    for (var i = 0; i < dim; i++) {
        // parse dimension
        dims[i] = parseBits(value, 32, offset);
        offset += 32;

        // ignore lower bounds
        offset += 32;
    };


    var parseElement = function(elementType) {
        // parse content length
        var length = parseBits(value, 32, offset);
        offset += 32;

        // parse null values
        if (length == 0xffffffff) {
            return null;
        }

        if ((elementType == 0x17) || (elementType == 0x14)) {
            // int/bigint
            var result = parseBits(value, length * 8, offset);
            offset += length * 8;
            return result;
        }
        else if (elementType == 0x19) {
            // string
            var result = value.toString(this.encoding, offset >> 3, (offset += (length << 3)) >> 3);
            return result;
        }
        else {
            console.log("ERROR: ElementType not implemented: " + elementType);
        }
    };

    var parse = function(dimension, elementType) {
        var array = new Array();

        if (dimension.length > 1) {
            var count = dimension.shift();
            for (var i = 0; i < count; i++) {
                array[i] = parse(dimension, elementType);
            }
            dimension.unshift(count);
        }
        else {
            for (var i = 0; i < dimension[0]; i++) {
                array[i] = parseElement(elementType);
            }
        }

        return array;
    }

    return parse(dims, elementType);
};

module.exports = BinaryParser;

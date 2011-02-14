var TextParser = function(config) {
    config = config || {};
};

var p = TextParser.prototype;

p.parseBool = function(value) {
    return (value === 't');
}

p.parseInt64 = p.parseInt32 = p.parseInt16 = function(value) {
    return parseInt(value);
}

p.parseNumeric = p.parseFloat64 = p.parseFloat32 = function(value) {
    return parseFloat(value);
}

p.parseDate = function(value) {
    //TODO this could do w/ a refactor

    var dateMatcher = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;

    var match = dateMatcher.exec(value);
    var year = match[1];
    var month = parseInt(match[2],10)-1;
    var day = match[3];
    var hour = parseInt(match[4],10);
    var min = parseInt(match[5],10);
    var seconds = parseInt(match[6], 10);

    var miliString = match[7];
    var mili = 0;
    if(miliString) {
        mili = 1000 * this.parseFloat(miliString);
    }

    var tZone = /([Z|+\-])(\d{2})?(\d{2})?/.exec(value.split(' ')[1]);
    //minutes to adjust for timezone
    var tzAdjust = 0;

    if(tZone) {
        var type = tZone[1];
        switch(type) {
        case 'Z': break;
        case '-':
            tzAdjust = -(((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
            break;
        case '+':
            tzAdjust = (((parseInt(tZone[2],10)*60)+(parseInt(tZone[3]||0,10))));
            break;
        default:
            throw new Error("Unidentifed tZone part " + type);
        }
    }

    var utcOffset = Date.UTC(year, month, day, hour, min, seconds, mili);

    var date = new Date(utcOffset - (tzAdjust * 60* 1000));
    return date;
}

p.parseIntArray = function(value) {
    return JSON.parse(val.replace("{","[").replace("}","]"));
};

p.parseStringArray = function(value) {
    if (!value) return null;
    if (value[0] !== '{' || value[value.length-1] !== '}')
        throw "Not postgresql array! (" + value + ")";

    var x = value.substring(1, value.length - 1);
    x = x.match(/(NULL|[^,]+|"((?:.|\n|\r)*?)(?!\\)"|\{((?:.|\n|\r)*?(?!\\)\}) (,|$))/mg);
    if (x === null) throw "Not postgre array";
    return x.map(function (el) {
        if (el === 'NULL') return null;
        if (el[0] === '{') return arguments.callee(el);
        if (el[0] === '\"')  return el.substring(1, el.length - 1).replace('\\\"', '\"');
        return el;
    });
};

module.exports = TextParser;

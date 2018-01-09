'use strict';

const rUrl = require('url');
const http = require('http');
const querystring = require('querystring');

exports.root = 'http://www.websequencediagrams.com';
exports.styles = ['default',
    'earth',
    'modern-blue',
    'mscgen',
    'omegapple',
    'qsd',
    'rose',
    'roundgreen',
    'napkin',
    'magazine',
    'vs2010',
    'patent'
];
exports.proxy = {};

function isEmpty(obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function getBaseOptions(url, cb) {
    if (isEmpty(exports.proxy)) {
        var ret = rUrl.parse(url);
        ret.headers = {};
        return ret;
    } else {
        if (!exports.proxy.host) {
            cb(new Error('host property missing in proxy settings'));
        }

        var options = {};

        options.host = exports.proxy.host;

        if (exports.proxy.port) {
            options.port = exports.proxy.port;
        }

        options.path = url;
        options.headers = {};
        options.headers.Host = exports.root;

        return options;
    }
};

function getResultBuffer(res, cb) {
    if (res.statusCode !== 200) {
        return cb(new Error('HTTP Error: ' + res.statusCode));
    }
    const size = parseInt(res.headers['content-length'], 10);
    const buf = new Buffer(size);
    buf.fill(0);
    let offset = 0;

    res.on('data', (chunk) => {
        chunk.copy(buf, offset);
        offset += chunk.length;
    });

    res.on('error', cb);
    res.on('end', () => {
        if (offset !== size) {
            return cb(new Error(`Invalid response size: ${size} expected, ${offset} received`));
        }
        cb(null, buf, res.headers['content-type'])
    });
}

exports.diagram_url = function diagram_url(description, style, format, cb) {
    if (typeof cb !== 'function') {
        throw new Error('cb function is required');
    }

    if (!style) {
        style = 'default';
    } else if (exports.styles.indexOf(style) === -1) {
        cb(new Error('Unknown style: ' + style));
        return;
    }
    if (!format) {
        format = 'png';
    } else if (['png', 'pdf', 'svg'].indexOf(format) === -1) {
        cb(new Error('Unknown format: ' + format));
        return;
    }

    if (description instanceof Buffer) {
        description = description.toString('utf8');
    }
    const query = {
        'style': style,
        'message': description,
        'apiVersion': '1',
        'format': format
    };
    const querys = querystring.stringify(query);

    var options = getBaseOptions(exports.root + '/index.php', cb);
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.headers['Content-Length'] = querys.length;

    const req = http.request(options, (res) => {
        getResultBuffer(res, (er, buf, typ) => {
            if (er) {
                return cb(er);
            }
            if (!(typ == 'application/x-json' || typ == 'application/json')) {
                return cb(new Error('Invalid MIME type for JSON: ' + typ));
            }

            let jres;
            try {
                jres = JSON.parse(buf);
            } catch (e) {
                return cb(e);
            }
            if (!jres.errors) {
                return cb(new Error('Invalid JSON response: ' + jres));
            }

            if (jres.errors.length > 0) {
                return cb(new Error(jres.errors.join(', ')));
            }

            cb(null, exports.root + '/' + jres.img);
        });
    });

    req.on('error', cb);
    req.write(querys);
    req.end();
};

exports.diagram = function diagram(description, style, format, cb) {
    if (typeof cb !== 'function') {
        throw new Error('cb function is required');
    }
    exports.diagram_url(description, style, format, (er, u) => {
        if (er) {
            return cb(er);
        }

        var options = getBaseOptions(u, cb);

        http.get(options, (res) => getResultBuffer(res, cb));
    });
};
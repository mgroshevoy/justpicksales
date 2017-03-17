const parse = require('csv-parse');
const fs = require('fs');
const path = require('path');

/**
 * Load CSV file to Array
 * @param strFileName
 * @returns {Promise}
 */
function loadCSV(strDir, strFileName) {
    return new Promise((resolve, reject) => {
        var parser = parse({
            delimiter: ',',
            columns: true
        }, function (err, data) {
            if (err) {
                console.error(err);
                resolve([{'Order ID': 'No data'}]);
            }
            console.log(path.join(strDir, strFileName));
            console.log(data);
            resolve(data);
        });
        fs.createReadStream(path.join(strDir, strFileName)).pipe(parser);
    });
}

/**
 * Check if Dir exists
 * @param dpath String
 * @returns {boolean}
 */
function isDir(dpath) {
    try {
        return fs.lstatSync(dpath).isDirectory();
    } catch (e) {
        console.log('Dir doesnt exist');
        return false;
    }
};

/**
 * Create Dir
 * @param dirname String
 */
function mkdirp(dirname) {
    dirname = path.normalize(dirname).split(path.sep);
    dirname.forEach((sdir, index) => {
        var pathInQuestion = dirname.slice(0, index + 1).join(path.sep);
        if ((!isDir(pathInQuestion)) && pathInQuestion) fs.mkdirSync(pathInQuestion);
    });
};

module.exports.loadCSV = loadCSV;
module.exports.mkdirp = mkdirp;
module.exports.isDir = isDir;
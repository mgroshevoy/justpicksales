const express = require('express');
const router = express.Router();
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var parse = require('csv-parse');
var moment = require('moment');
var Nightmare = require('nightmare');
require('nightmare-download-manager')(Nightmare);

var email = process.env.AMAZON_EMAIL;
var password = process.env.AMAZON_PASS;
var objFile;

fs.isDir = function (dpath) {
    try {
        return fs.lstatSync(dpath).isDirectory();
    } catch (e) {
        console.log('Dir doesnt exist');
        return false;
    }
};

fs.mkdirp = function (dirname) {
    dirname = path.normalize(dirname).split(path.sep);
    dirname.forEach((sdir, index) => {
        var pathInQuestion = dirname.slice(0, index + 1).join(path.sep);
        if ((!fs.isDir(pathInQuestion)) && pathInQuestion) fs.mkdirSync(pathInQuestion);
    });
};

if (!fs.isDir('./amazonorders')) {
    fs.mkdirp('./amazonorders');
}

var csvDir = path.resolve('./amazonorders') || '';

console.log('CSV= '+csvDir);
//Order Date,Order ID,Title,Category,ASIN/ISBN,UNSPSC Code,Website,Release Date,Condition,Seller,Seller Credentials,List Price Per Unit,Purchase Price Per Unit,Quantity,Payment Instrument Type,Purchase Order Number,PO Line Number,Ordering Customer Email,Shipment Date,Shipping Address Name,Shipping //Address Street 1,Shipping Address Street 2,Shipping Address City,Shipping Address State,Shipping Address Zip,Order Status,Carrier Name & Tracking Number,Item Subtotal,Item Subtotal Tax,Item Total,Tax Exemption Applied,Tax Exemption Type,Exemption Opt-Out,Buyer Name,Currency,Group Name

function getAmazonOrders() {
    return new Promise(resolve => {
        if (isReportReady()) {
            resolve(loadCSV(getMostRecentFileName(csvDir)));
        } else {
            var nightmare = new Nightmare({
                // openDevTools: {
                //     mode: 'detach'
                // },
                // show: true,
                // paths: {
                //     downloads: csvDir
                // }
            });

            nightmare.on('download', function (state, downloadItem) {
                if (state == 'started') {
                    objFile = downloadItem;
                    nightmare.emit('download', downloadItem);
                }
            });

            nightmare
                .downloadManager()
                .useragent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36")
                .goto('https://www.amazon.com/gp/b2b/reports?')
                .wait()
                .type('form [name=email]', email)
                .wait()
                .type('form [name=password]', password)
                .wait()
                .click('#signInSubmit')
                .wait('#report-last30Days')
                .click('#report-last30Days')
                .wait()
                .click('#report-confirm')
                .wait()
                .waitDownloadsComplete()
                .end()
                .then(function () {
//        console.log(objFile.filename);
                    resolve(loadCSV(objFile.filename));
                });
        }
    });
}

/**
 * Load CSV file to Array
 * @param strFileName
 * @returns {Promise}
 */
function loadCSV(strFileName) {
    return new Promise((resolve,reject) => {
        var parser = parse({
            delimiter: ',',
            columns: true
        }, function (err, data) {
            if (err) {
                console.error(err);
                resolve([{'Order Date':'No data'}]);
            }
            console.log(path.join(csvDir, strFileName));
            //console.log(data);
            resolve(data);
        });
        fs.createReadStream(path.join(csvDir, strFileName)).pipe(parser);
    });
}

function isReportReady() {
    var lastFileName = getMostRecentFileName(csvDir);
    if (lastFileName === null || lastFileName === '.gitkeep') return false;
    var lastFileDate = fs.statSync(path.join(csvDir, lastFileName)).ctime;
    return moment().isSame(moment(lastFileDate), 'day');
}

// Return only base file name without dir
function getMostRecentFileName(dir) {
    var files = fs.readdirSync(dir);
    if (files.length == 0) {
        return null;
    }
    return _.maxBy(files, function (f) {
        var fullpath = path.join(dir, f);

        // ctime = creation time is used
        // replace with mtime for modification time
        return fs.statSync(fullpath).ctime;
    });
}

/* GET Amazon search */
router.get('/search', function (req, res, next) {
    getAmazonOrders().then(result => {
        console.log(result);
        res.send(result);
    });
    // authAmazon(req).then(result => {
    //     res.send(result);
    //     if (req.query) {
    //     }
    // });
});

/* GET Amazon orders page. */
router.get('/', function (req, res, next) {
    res.render('amazon', {
        title: 'Amazon orders'
    });
});

module.exports = router;


// var browser = new Browser({
// debug: true,
// userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36'
// });
// var img = null;

// function authAmazon(req) {
//     var startURL = 'https://www.amazon.com/';
//     var refreshLink;
//     var email = 'mbg@rambler.ru';
//     var password = 'egorka@&)$';

// console.log(browser.cookies);
// console.log(req.query);
// return new Promise(resolve => {
//     if (req.query.captcha) {
//         console.log(req.query.captcha);
//         //browser.fill('email', email);
//         browser.fill('password', password);
//         browser.fill('guess', req.query.captcha);
//         browser.pressButton('#signInSubmit', function () {
//             console.log('Authorized!');
//             console.log(browser.html());
//             resolve(browser.html());
//         });
//     }
//     if (browser.cookies.length == 0) {
//         browser.visit(startURL, function () {
//             browser.clickLink('#nav-tools>a', function () {
//                 browser.fill('email', email);
//                 browser.fill('password', password);
//                 browser.pressButton('#signInSubmit', function () {
//                     img = browser.querySelector('img#auth-captcha-image');
//                     if (img === null) {
//                         console.log('Authorized!');
//                         console.log(browser.html());
//                         resolve(browser.html());
//                     } else {
//                         refreshLink = browser.querySelector('a#auth-captcha-refresh-link');
//                         console.log(img.src);
//                         resolve({captcha: img.src});
//                         //browser.fill('guess', captcha);
//                     }
//                 });
//             });
//         });
//     } else {
//         if (img === null) {
//             resolve({status: 'LoadingCaptcha'});
//         } else {
//             console.log(img.src);
//             resolve({captcha: img.src});
//         }
//     }
// });
// }
require('dotenv').config();
const express = require('express');
const router = express.Router();
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var parse = require('csv-parse');
var moment = require('moment');
var Nightmare = require('nightmare');
require('nightmare-download-manager')(Nightmare);
var vo = require('vo');
var AmazonModel = require('../libs/mongoose').AmazonModel;


var email = process.env.AMAZON_EMAIL;
var password = process.env.AMAZON_PASS;
var objFile;


/**
 * Check if Dir exists
 * @param dpath String
 * @returns {boolean}
 */
fs.isDir = function (dpath) {
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

//console.log('CSV= ' + csvDir);
//Order Date,Order ID,Title,Category,ASIN/ISBN,UNSPSC Code,Website,Release Date,Condition,Seller,Seller Credentials,List Price Per Unit,Purchase Price Per Unit,Quantity,Payment Instrument Type,Purchase Order Number,PO Line Number,Ordering Customer Email,Shipment Date,Shipping Address Name,Shipping //Address Street 1,Shipping Address Street 2,Shipping Address City,Shipping Address State,Shipping Address Zip,Order Status,Carrier Name & Tracking Number,Item Subtotal,Item Subtotal Tax,Item Total,Tax Exemption Applied,Tax Exemption Type,Exemption Opt-Out,Buyer Name,Currency,Group Name

/**
 * Get Amazon orders list
 * @returns {Promise}
 */
function getAmazonOrders() {
    return new Promise(resolve => {
        if (isReportReady()) {
            resolve(loadCSV(getMostRecentFileName(csvDir)));
        } else {
            var nightmare = new Nightmare({
                openDevTools: {
                    mode: 'detach'
                },
                show: true,
                paths: {
                    downloads: csvDir
                }
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
                    resolve(loadCSV(objFile.filename));
                })
                .catch(function (error) {
                    console.log(error);
                    resolve({error: error});
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
    return new Promise((resolve, reject) => {
        var parser = parse({
            delimiter: ',',
            columns: true
        }, function (err, data) {
            if (err) {
                console.error(err);
                resolve([{'Order ID': 'No data'}]);
            }
            console.log(path.join(csvDir, strFileName));
            //console.log(data);
            resolve(data);
        });
        fs.createReadStream(path.join(csvDir, strFileName)).pipe(parser);
    });
}

/**
 * Check last report date
 * @returns {boolean}
 */
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

/**
 * Save order in DB
 * @param order Object
 * @returns {Promise}
 */
function saveOrder(order) {
    return new Promise((resolve) => {
        var objOrder;
        AmazonModel.findOne({id: order['Order ID']}, function (err, obj) {
            if (obj === null && order['Order ID'] != 'No data') {
                objOrder = new AmazonModel({
                    id: order['Order ID'],
                    date: order['Order Date'],
                    title: order['Title'],
                    category: order['Category'],
                    asin_isbn: order['ASIN/ISBN'],
                    unspsc: order['UNSPSC Code'],
                    condition: order['Condition'],
                    seller: order['Seller'],
                    list_price_unit: Number(order['List Price Per Unit'].substr(1)),
                    purchase_price_unit: Number(order['Purchase Price Per Unit'].substr(1)),
                    quantity: Number(order['Quantity']),
                    payment_type: order['Payment Instrument Type'],
                    customer_email: order['Ordering Customer Email'],
                    shipment_date: order['Shipment Date'],
                    shipping_name: order['Shipping Address Name'],
                    shipping_street1: order['Shipping Address Street 1'],
                    shipping_street2: order['Shipping Address Street 2'],
                    shipping_city: order['Shipping Address City'],
                    shipping_state: order['Shipping Address State'],
                    shipping_zip: order['Shipping Address Zip'],
                    order_status: order['Order Status'],
                    tracking_number: order['Carrier Name & Tracking Number'],
                    subtotal: Number(order['Item Subtotal'].substr(1)),
                    subtotal_tax: Number(order['Item Subtotal Tax'].substr(1)),
                    total: order['Item Total'].substr(1),
                    buyer_name: order['Buyer Name'],
                    currency: order['Currency']
                });
                objOrder.save(function (err) {
                    if (!err) {
                        console.info("Order saved!");
                    } else {
                        console.error('Internal error: %s', err.message);
                    }

                });
            }
            resolve(obj);
        });
    })
}
/**
 * GET Amazon search
 */
router.get('/search', function (req, res, next) {
    getAmazonOrders().then(result => {
        var i, promises = [];
        console.log(result);
        for (i = 0; i < result.length; i++) {
            promises.push(saveOrder(result[i]));
        }
        Promise.all(promises);
        res.send(result);
    });
});

/**
 * GET Amazon orders page
 */
router.get('/', function (req, res, next) {
    vo(function*() {
        return yield AmazonModel.find().sort('-date');
    })((err, result) => {
        res.render('amazon', {
            title: 'Amazon orders',
            orders: result
        });
    });

});

module.exports = router;
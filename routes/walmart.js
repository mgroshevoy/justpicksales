require('dotenv').config();
const express = require('express');
const router = express.Router();
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var moment = require('moment');
var Nightmare = require('nightmare');
var vo = require('vo');
var WalmartModel = require('../libs/mongoose').WalmartModel;


var email = process.env.WALMART_EMAIL;
var password = process.env.WALMART_PASS;
var flag = false;

/**
 * Authentication on Walmart
 * @param nightmare Object
 * @returns {*|{trigger, _default}}
 */
function setWalmartAuth(nightmare) {
    return nightmare
        .useragent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36")
        .goto('http://www.walmart.com/')
        .goto('https://www.walmart.com/account/orders')
        .wait('.form-box')
        .type('form [name=email]', email)
        .type('form [name=password]', password)
        .click('form [type=submit]')
}

/**
 * Get order list
 * @param nightmare Object
 * @returns {Object|*}
 */
function getWalmartOrders(nightmare) {
    return nightmare
    //.wait('.order-history-value')
        .wait('.text-right')
        .evaluate(() => {
            var i, arrayOfOrders = [];
            var a = document.querySelectorAll('a.btn.btn-block-max-s.s-margin-top.pull-right.pull-none-m');
            var id = document.querySelectorAll('.order-history-value');
            var date = document.querySelectorAll('.heading-a.font-semibold');
            for (i = 0; i < a.length; i++)  arrayOfOrders.push({
                id: id[i].textContent,
                url: a[i].href,
                date: date[i].textContent
            });
            return arrayOfOrders;
        })
}

/**
 * Get order details
 * @param nightmare Object
 * @param url String
 * @returns {Object|*}
 */
function getOrderDetails(nightmare, url) {
    return nightmare
        .goto(url)
        .wait('.order-summary-items')
        .evaluate(() => {
            var orderDetails = {};
            var address = document.querySelector('.order-shipping-address');
            var total = document.querySelector('dd.order-total');
            if (address != null) {
                orderDetails.address = address.textContent;
            } else {
                address = document.querySelector('.order-item-title');
                if (address != null) {
                    orderDetails.address = 'To:' + address.textContent;
                } else orderDetails.address = 'To: '
            }
            if (total != null) orderDetails.total = total.textContent;
            return orderDetails;
        })
}

/**
 * Save order in DB
 * @param result Object
 * @returns {Promise}
 */
function saveOrder(result) {
    return new Promise((resolve) => {
        var order;
        WalmartModel.findOne({id: result.id}, function (err, obj) {
            if (obj === null) {
                order = new WalmartModel({
                    id: result.id,
                    date: result.date,
                    url: result.url,
                    address: result.address.replace(/\s+/g, " "),
                    total: result.total ? Number(result.total.substr(1)) : 0
                });
                order.save(function (err) {
                    if (!err) {
                        console.info("Order saved!");
                    } else {
                        console.error('Internal error: %s', err.message);
                    }
                });
            }
            resolve(obj);
        });
    });
}

/**
 * GET Walmart orders update
 */
// router.get('/search', function (req, res, next) {
function getWalmartOrdersUpdate() {
    return new Promise((resolve) => {
        if (!flag) {
            flag = true;
            var arrayOfOrders = [];
            var nightmare = new Nightmare({
                openDevTools: {
                    mode: 'detach'
                },
                show: true,
                webPreferences: {
                    webSecurity: false
                }
            });
            vo(function*() {
                var i, isIdInDB = false;
                yield setWalmartAuth(nightmare);
                arrayOfOrders = yield getWalmartOrders(nightmare);
                while (yield nightmare.exists('a.s-margin-left')) {
                    yield WalmartModel.findOne({id: _.last(arrayOfOrders).id}, function (err, obj) {
                        console.log(obj);
                        if (obj != null) {
                            isIdInDB = true;
                        }
                    });
                    if (isIdInDB) break;
                    if (yield nightmare.exists('a.btn error-ErrorPage-link')) yield nightmare.click('a.btn error-ErrorPage-link');
                    yield nightmare.click('a.s-margin-left');
                    arrayOfOrders = _.concat(arrayOfOrders, yield getWalmartOrders(nightmare));
                }
                for (i = 0; i < arrayOfOrders.length; i++) {
                    var orderDetails = yield getOrderDetails(nightmare, arrayOfOrders[i].url);
                    if (yield nightmare.exists('a.btn error-ErrorPage-link')) yield nightmare.click('a.btn error-ErrorPage-link');
                    arrayOfOrders[i].address = orderDetails.address.substr(3);
                    arrayOfOrders[i].total = orderDetails.total;
                }
                yield nightmare.end();
                return arrayOfOrders;
            })((err, result) => {
                var i, promises = [];
                if (err) return console.log(err);
                console.log(result);
                for (i = 0; i < result.length; i++) {
                    promises.push(saveOrder(result[i]));
                }
                Promise.all(promises);
                flag = false;
                resolve();
            });
        }
    });
}

/**
 * GET Walmart orders page
 */
router.get('/', function (req, res, next) {
    res.io.on('connection', function (socket) {
        socket.on('updateWalmart', function () {
            getWalmartOrdersUpdate().then(() => {
                res.io.emit('updateOver');
            });
        });
    });
    vo(function*() {
        return yield WalmartModel.find().sort('-date');
    })((err, result) => {
        console.log(result);
        vo(function*() {
            return yield WalmartModel.find().limit(1).sort({$natural: -1});
        })((error, lastRec) => {
            res.render('walmart', {
                title: 'Walmart orders',
                orders: result,
                lastUpdate: lastRec[0] ? lastRec[0]._id.getTimestamp() : 'No updates'
            });
        });
    });
});

module.exports = router;
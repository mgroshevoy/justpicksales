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

function setWalmartAuth(nightmare) {
    return nightmare
        .useragent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36")
        .goto('https://www.walmart.com/account/orders')
        .wait('.form-box')
        .type('form [name=email]', email)
        .type('form [name=password]', password)
        .click('form [type=submit]')
}

function getWalmartOrders(nightmare) {
    return nightmare
        .wait('.order-history-value')
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

function getOrderDetails(nightmare, url) {
    return nightmare
        .goto(url)
        .wait('.order-summary-items')
        .evaluate(() => {
            var orderDetails = {};
            var address = document.querySelector('.order-shipping-address');
            var total = document.querySelector('.order-summary-info-price-value');
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

function saveOrder(result) {
    return new Promise((resolve) => {
        var order;
        WalmartModel.findOne({id: result.id}, function (err, obj) {
            if (obj === null) {
                order = new WalmartModel({
                    id: result.id,
                    date: result.date,
                    url: result.url,
                    address: result.address,
                    total: result.total
                });
                order.save(function (err) {
                    if (!err) {
                        console.info("Order saved!");
                    } else {
                        console.error('Internal error: %s', err.message);
                    }
                });
            }
            resolve (obj);
        });
    });
}

/* GET Walmart search */
router.get('/search', function (req, res, next) {

    if (!flag) {
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
        flag = true;
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
        });
    }
});

/* GET Walmart orders page. */
router.get('/', function (req, res, next) {
    vo(function*() {
        return yield WalmartModel.find().sort('-date');
    })((err, result) => {
        console.log(result);
        res.render('walmart', {
            title: 'Walmart orders',
            orders: result
        });
    });
});

module.exports = router;
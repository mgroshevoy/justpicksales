const express = require('express');
const router = express.Router();
const ebay = require('ebay-api');
const _ = require('lodash');
const moment = require('moment');
const cheerio = require('cheerio');
//var request = require('request');
const axios = require('axios');
const axiosRetry = require('axios-retry');

let flag = false;
//let arrayOrders = [];
let orders;

/**
 * Ebay API request to Trading:GetOrders
 * @param intPage
 * @returns {Promise}
 */
function ebayRequest(intPage = 1) {
    return new Promise((resolve, reject) => {
        ebay.xmlRequest({
            serviceName: 'Trading',
            opType: 'GetOrders',

            // app/environment
            devId: process.env.EBAY_DEVID,
            certId: process.env.EBAY_CERTID,
            appId: process.env.EBAY_APPID,
            sandbox: false,

            // per user
            authToken: process.env.EBAY_AUTHTOKEN,

            params: {
                OrderStatus: 'All',
                CreateTimeFrom: moment().subtract(90, 'days').toISOString(),
                CreateTimeTo: moment().toISOString(),
                OrderRole: 'Seller',
                Pagination: {
                    EntriesPerPage: 100,
                    PageNumber: intPage
                }
            }
        }, function (error, results) {
            if (error) {
                console.error(error);
                reject(error);
            }
            resolve(results);
        });
    });
}


function getOrdersFromEbay() {
    let i = 1, promises = [], arrayOrders = [];
    return new Promise((resolve, reject) => {
        ebayRequest().then((results) => {
            arrayOrders.push(results);
            for (i = 2; i <= results.PaginationResult.TotalNumberOfPages; i++) {
                promises.push(ebayRequest(i));
            }
            return Promise.all(promises);
        }).then((results) => {
            let res = [];
            arrayOrders = _.concat(arrayOrders, results);
            _.forEach(arrayOrders, function (o) {
                _.forEach(o.Orders, function (order) {
                    res.push({
                        OrderID: order.OrderID,
                        OrderStatus: order.OrderStatus,
                        Items: [],
                        eBayPaymentStatus: order.CheckoutStatus.eBayPaymentStatus,
                        Status: order.CheckoutStatus.Status,
                        PaidTime: order.PaidTime,
                        Total: order.Total._
                    });
                    _.forEach(order.Transactions, function (transaction) {
                        res[res.length - 1].Items.push({
                            ItemID: transaction.Item.ItemID,
                            Title: transaction.Item.Title,
                            SKU: transaction.Item.SKU,
                        });
                    })
                })
            });
            return res;
        }).catch(error => {
            console.error(error);
            reject(error);
        }).then(results => {
            let promises = [];
            _.forEach(results, function (o, i) {
                _.forEach(o.Items, function (item, j) {
                    promises.push(new Promise((resolve, reject) => {
                        //                        axiosRetry(axios, {retries: 3});
                        setTimeout(function () {
                            axios.get("http://cgi.ebay.com/ws/eBayISAPI.dll?ViewItem&item=" + item.ItemID)
                                .then((response) => {
                                    $ = cheerio.load(response.data);
                                    results[i].Items[j].Image = $('#icImg')['0'].attribs.src;
                                    resolve(results);
                                }).catch(error => {
                                console.error(error);
                                reject(results);
                            });
                        }, i * 200);
                    }));
                })
            });
            return Promise.all(promises);
        }).catch(error => {
            console.error(error);
            reject(error);
        }).then(results => {
            // console.log(results);
            console.log('Search is done!');
            results[results.length - 1] = _.orderBy(results[results.length - 1], ['PaidTime'], ['desc']);
            resolve(results[results.length - 1]);
        }).catch(error => {
            console.error(error);
            reject(error);
        });
    });
}

router.get('/', function (req, res, next) {
    console.log('search ' + flag);
    if (!flag && !(_.isArray(orders))) {
        flag = true;
        getOrdersFromEbay().then(results => {
            console.log('Work is done!');
            res.send({orders: results});
            orders = _.clone(results);
            console.log(orders);
//            flag = false;
        }).catch(error => {
            console.error(error);
        });
    } else {
        if (_.isArray(orders)) {
            res.send({orders: orders});
        } else res.send({inProgress: true});
        console.log(orders);
        //res.render('orders', {title: 'Orders', orders: orders});
        //res.send();
    }
});

module.exports = router;

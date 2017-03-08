require('dotenv').config();
const express = require('express');
const router = express.Router();
const ebay = require('ebay-api');
const _ = require('lodash');
const moment = require('moment');
const cheerio = require('cheerio');
const axios = require('axios');
var vo = require('vo');
var EbayModel = require('../libs/mongoose').EbayModel;


let flag = false;
let orders;

/**
 * Ebay API request to Trading:GetOrders
 * @param intPage
 * @returns {Promise}
 */
function ebayGetOrders(intPage = 1) {
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
                DetailLevel: 'ReturnAll',
                IncludeFinalValueFee: true,
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

/**
 * Ebay API request to Trading:GetSellerList
 * @param intPage
 * @returns {Promise}
 */
function ebayGetSellerList(intPage = 1) {
    return new Promise((resolve, reject) => {
        ebay.xmlRequest({
            serviceName: 'Trading',
            opType: 'GetSellerList',

            // app/environment
            devId: process.env.EBAY_DEVID,
            certId: process.env.EBAY_CERTID,
            appId: process.env.EBAY_APPID,
            sandbox: false,

            // per user
            authToken: process.env.EBAY_AUTHTOKEN,

            params: {
                DetailLevel: 'ReturnAll',
                IncludeFinalValueFee: true,
                StartTimeFrom: moment().subtract(120, 'days').toISOString(),
                StartTimeTo: moment().toISOString(),
                // EndTimeFrom: moment().subtract(120, 'days').toISOString(),
                // EndTimeTo: moment().toISOString(),
                Sort: 1,
                //GranularityLevel: 'Coarse',
                Pagination: {
                    EntriesPerPage: 200,
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
/**
 * Get Orders from Ebay
 * @returns {Promise}
 */
function getOrdersFromEbay() {
    let i = 1, promises = [], arrayOfOrders = [], arrayOfResults = [], arrayOfSellerList = [];
    return new Promise((resolve, reject) => {
        ebayGetOrders().then(results => {
            arrayOfOrders.push(results);
            for (i = 2; i <= results.PaginationResult.TotalNumberOfPages; i++) {
                promises.push(ebayGetOrders(i));
            }
            return Promise.all(promises);
        }).then(results => {
            var res = [];
            arrayOfOrders = _.concat(arrayOfOrders, results);
            _.forEach(arrayOfOrders, function (o) {
                _.forEach(o.Orders, function (order) {
                    console.log(order);
                    res.push({
                        OrderID: order.OrderID,
                        CreatedTime: order.CreatedTime,
                        AdjustmentAmount: order.AdjustmentAmount.amount,
                        AmountPaid: order.AmountPaid.amount,
                        OrderStatus: order.OrderStatus,
                        Items: [],
                        eBayPaymentStatus: order.CheckoutStatus.eBayPaymentStatus,
                        Status: order.CheckoutStatus.Status,
                        PaidTime: order.PaidTime,
                        Total: order.Total._,
                        Address: order.ShippingAddress,
                        SellingManagerNumber: order.ShippingDetails.SellingManagerSalesRecordNumber
                    });
                    _.forEach(order.Transactions, function (transaction) {
                        res[res.length - 1].Items.push({
                            ItemID: transaction.Item.ItemID,
                            Title: transaction.Item.Title,
                            SKU: transaction.Item.SKU,
                            FinalValueFee: transaction.FinalValueFee._
                        });
                    })
                })
            });
            return res;
        }).catch(error => {
            console.error(error);
            reject(error);
        }).then(result => {
            return new Promise(resolve => {
                arrayOfResults = _.clone(result);
                ebayGetSellerList().then(results => {
                    arrayOfSellerList = _.concat(arrayOfSellerList, results.Items);
                    let promises = [];
                    for (i = 2; i <= results.PaginationResult.TotalNumberOfPages; i++) {
                        promises.push(ebayGetSellerList(i));
                    }
                    resolve(Promise.all(promises));
                });
            });
        }).then(results => {
            let element;
            _.forEach(results, function (page) {
                arrayOfSellerList = _.concat(arrayOfSellerList, page.Items);
            });
            _.forEach(arrayOfResults, function (o, i) {
                _.forEach(o.Items, function (item, j) {
                    element = _.findIndex(arrayOfSellerList, ['ItemID', arrayOfResults[i].Items[j].ItemID]);
                    if (element != -1) {
                        arrayOfResults[i].Items[j].Image = arrayOfSellerList[element].PictureDetails.GalleryURL;
                    }
                });
            });
            return arrayOfResults;
        }).then(results => {
            let promises = [];
            _.forEach(results, function (o, i) {
                _.forEach(o.Items, function (item, j) {
                    if (!_.isString(results[i].Items[j].Image)) {
                        promises.push(axios.get("http://cgi.ebay.com/ws/eBayISAPI.dll?ViewItem&item=" + item.ItemID)
                            .then((response) => {
                                $ = cheerio.load(response.data);
                                results[i].Items[j].Image = $('#icImg')[0].src;
                                resolve(results[i].Items[j].Image);
                            }).catch(error => {
                                console.error(error);
                                reject(error);
                            }));
                    }
                    console.log(results[i].Items[j].Image);
                });
            });
            console.log(promises.length);
            Promise.all(promises);
            resolve(results);
        }).catch(error => {
            console.error(error);
            reject(error);
        });
    });
}

/**
 * Save order in DB
 * @param order Object
 * @returns {Promise}
 */
function saveOrder(order) {
    return new Promise((resolve, reject) => {
        var objOrder;
        EbayModel.findOne({id: order['OrderID']}, function (err, obj) {
            if (obj === null) {
                objOrder = new EbayModel({
                    id: order['OrderID'],
                    created_time: order['CreatedTime'],
                    adj_amount: order['AdjustmentAmount'],
                    paid_amount: order['AmountPaid'],
                    items: order['Items'],
                    order_status: order['OrderStatus'],
                    payment_status: order['eBayPaymentStatus'],
                    status: order['Status'],
                    paid_time: order['PaidTime'],
                    total: order['Total'],
                    sellingmanagernumber: order['SellingManagerNumber'],
                    address: {
                        name: order.Address.Name,
                        street1: order.Address.Street1,
                        street2: order.Address.Street2,
                        city: order.Address.CityName,
                        state: order.Address.StateOrProvince,
                        country: order.Address.Country,
                        country_name: order.Address.CountryName,
                        phone: order.Address.Phone,
                        postal_code: order.Address.PostalCode
                    }
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
 * Get orders
 */
router.get('/', function (req, res, next) {
    res.io.on('connection', function (socket) {
        socket.on('updateBegin', function () {
            console.log('Flag is: ' + flag);
            if (!flag) {
                flag = true;
                getOrdersFromEbay().then(results => {
                    var i, promises = [];
                    console.log('Saving...');
                    console.log(results);
                    for (i = 0; i < results.length; i++) {
                        console.log('I=' + i);
                        console.log(results[i]);
                        promises.push(saveOrder(results[i]));
                    }
                    return Promise.all(promises);
                }).then(() => {
                    res.io.emit('updateOver');
                    flag = false;
                });
            }
        });
    });
    vo(function*() {
        return yield EbayModel.find().sort('-created_time');
    })((err, result) => {
        vo(function*() {
            return yield EbayModel.find().limit(1).sort({$natural: -1});
        })((error, lastRec) => {
            res.render('orders', {
                title: 'Ebay Orders',
                orders: result,
                lastUpdate: lastRec[0] ? lastRec[0]._id.getTimestamp() : 'No updates'
            });
        });
    });
});

module.exports = router;
require('dotenv').config();
const express = require('express');
const router = express.Router();
const _ = require('lodash');
const moment = require('moment');
const vo = require('vo');
const EbayModel = require('../libs/mongoose').EbayModel;
const AmazonModel = require('../libs/mongoose').AmazonModel;
const WalmartModel = require('../libs/mongoose').WalmartModel;
const PurchaseModel = require('../libs/mongoose').PurchaseModel;

function addPrice(res) {
    res.io.on('connection', function (socket) {
        socket.on('addPrice', function (objPurchase) {
            PurchaseModel
                .findOne()
                .where('id', objPurchase.id)
                .then(result => {
                    let purchase;
                    purchase = new PurchaseModel({
                        id: objPurchase.id,
                        amazonprice: objPurchase.amazonprice,
                        walmartprice: objPurchase.walmartprice
                    });
                    if (result != null) {
                        result.amazonprice = objPurchase.amazonprice;
                        result.walmartprice = objPurchase.walmartprice;
                        result.save(function (err) {
                            if (!err) {
                                console.log('Purchase updated!');
                            } else {
                                console.error('Internal error: %s', err.message);
                            }
                        });
                    }
                    else {
                        purchase.save(function (err) {
                            if (!err) {
                                console.log('Purchase saved!');
                            } else {
                                console.error('Internal error: %s', err.message);
                            }
                        });
                    }
                })
        });
        socket.on('deletePrice', function (objPurchase) {
            PurchaseModel.remove({id: objPurchase.id}, function (err) {
                if(err) console.error('Internal error: %s', err.message);
                else console.log('Purchase deleted');
            })
        });
        socket.on('disconnect', function(){
            console.log('user disconnected');
            socket.removeAllListeners();
        });
    });
}

router.get('/:dateFrom/:dateTo', function (req, res, next) {
    let dateFrom, dateTo;
    addPrice(res);
    if (moment(req.params.dateFrom).isValid()) dateFrom = moment(req.params.dateFrom).format('YYYY-MM-DD');
    else dateFrom = moment().subtract(30, 'days').format('YYYY-MM-DD');
    if (moment(req.params.dateTo).isValid()) dateTo = moment(req.params.dateTo).format('YYYY-MM-DD');
    else dateTo = moment().format('YYYY-MM-DD');
    EbayModel
        .find()
        .where('created_time').gte(moment(dateFrom).startOf('day').add(7, 'hours')).lte(moment(dateTo).endOf('day').add(7, 'hours'))
        .sort('-created_time')
        .then(result => {
            var i, promises = [];
            for (i = 0; i < result.length; i++) {
                promises.push(AmazonModel
                    .findOne({
                        shipping_name: {
                            '$regex': result[i].address.name,
                            '$options': 'i'
                        },
                        date: {
                            $gte: moment(result[i].created_time).startOf('day'),
                            $lte: moment(result[i].created_time).startOf('day').add(6, 'days')
                        },
                        shipping_zip: {
                            '$regex': result[i].address.postal_code.substr(0, 5),
                            '$options': 'i'
                        }
                    }));
            }
            Promise.all(promises).then(amazonOrders => {
                for (i = 0; i < result.length; i++) {
                    result[i].amazon = amazonOrders[i];
                }
                promises = [];
                for (i = 0; i < result.length; i++) {
                    promises.push(WalmartModel
                        .findOne({
                            address: {
                                '$regex': result[i].address.name, // + '.*' + result[i].address.postal_code.substr(0, 5),
                                '$options': 'i'
                            },
                            date: {
                                $gte: moment(result[i].created_time).startOf('day'),
                                $lte: moment(result[i].created_time).startOf('day').add(6, 'days')
                            }
                        }));
                }
                Promise.all(promises).then(walmartOrders => {
                    for (i = 0; i < result.length; i++) {
                        result[i].walmart = walmartOrders[i];
                    }
                    promises = [];
                    for (i = 0; i < result.length; i++) {
                        promises.push(PurchaseModel.findOne({id: result[i].id}));
                    }
                    Promise.all(promises).then(purchaseOrders => {
                        for (i = 0; i < result.length; i++) {
                            result[i].purchase = purchaseOrders[i];
                        }
                        res.render('accounting', {
                            title: 'Accounting',
                            orders: result,
                            dateFrom: dateFrom,
                            dateTo: dateTo
                        });
                    });
                });
            });
        });
});

router.get('/', function (req, res, next) {
    addPrice(res);
    EbayModel
        .find()
        .where('created_time').gte(moment().subtract(30, 'days').startOf('day').add(7, 'hours'))
        .sort('-created_time')
        .then(result => {
            let i, promises = [];
            for (i = 0; i < result.length; i++) {
                promises.push(AmazonModel
                    .findOne({
                        shipping_name: {
                            '$regex': result[i].address.name,
                            '$options': 'i'
                        },
                        date: {
                            $gte: moment(result[i].created_time).startOf('day').toISOString(),
                            $lt: moment(result[i].created_time).startOf('day').add(3, 'days').toISOString()
                        },
                        shipping_zip: {
                            '$regex': result[i].address.postal_code.substr(0, 5),
                            '$options': 'i'
                        }
                    }));
            }
            Promise.all(promises).then(amazonOrders => {
                for (i = 0; i < result.length; i++) {
                    result[i].amazon = amazonOrders[i];
                }
                promises = [];
                for (i = 0; i < result.length; i++) {
                    promises.push(WalmartModel
                        .findOne({
                            address: {
                                '$regex': result[i].address.name, // + '.*' + result[i].address.postal_code.substr(0, 5),
                                '$options': 'i'
                            },
                            date: {
                                $gte: moment(result[i].created_time).startOf('day').toISOString(),
                                $lt: moment(result[i].created_time).startOf('day').add(3, 'days').toISOString()
                            }
                        }));
                }
                Promise.all(promises).then(walmartOrders => {
                    for (i = 0; i < result.length; i++) {
                        result[i].walmart = walmartOrders[i];
                    }
                    promises = [];
                    for (i = 0; i < result.length; i++) {
                        promises.push(PurchaseModel.findOne({id: result[i].id}));
                    }
                    Promise.all(promises).then(purchaseOrders => {
                        for (i = 0; i < result.length; i++) {
                            result[i].purchase = purchaseOrders[i];
                        }
                        res.render('accounting', {
                            title: 'Accounting',
                            orders: result
                        });
                    });
                });
            });
        });
});

module.exports = router;
require('dotenv').config();
var express = require('express');
var router = express.Router();
var _ = require('lodash');
var moment = require('moment');
var vo = require('vo');
var EbayModel = require('../libs/mongoose').EbayModel;
var AmazonModel = require('../libs/mongoose').AmazonModel;
var WalmartModel = require('../libs/mongoose').WalmartModel;


router.get('/', function (req, res, next) {
    EbayModel
        .find()
        .where('created_time').gte(moment().subtract(30, 'days').toISOString())
        .sort('-created_time')
        .then(result => {
            var i, promises = [];
            console.log(result.length);
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
                    console.log(result[i].amazon);
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
                    console.log(result);
                    res.render('accounting', {
                        title: 'Accounting',
                        orders: result
                    });
                });
            });
        });
});

module.exports = router;
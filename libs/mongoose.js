var mongoose = require('mongoose');

mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost/justpicksales');
var db = mongoose.connection;

db.on('error', function (err) {
    console.error('connection error:', err.message);
});
db.once('open', function callback() {
    console.info("Connected to DB!");
});

var Schema = mongoose.Schema;

// Schemas
var WalmartOrders = new Schema({
    id: {type: String, unique: true, required: true},
    date: Date,
    url: String,
    address: String,
    total: Number
});

var AmazonOrders = new Schema({
    id: {type: String, unique: true, required: true},
    date: Date,
    title: String,
    category: String,
    asin_isbn: String,
    unspsc: String,
    condition: String,
    seller: String,
    list_price_unit: Number,
    purchase_price_unit: Number,
    quantity: Number,
    payment_type: String,
    customer_email: String,
    shipment_date: Date,
    shipping_name: String,
    shipping_street1: String,
    shipping_street2: String,
    shipping_city: String,
    shipping_state: String,
    shipping_zip: String,
    order_status: String,
    tracking_number: String,
    subtotal: Number,
    subtotal_tax: Number,
    total: Number,
    buyer_name: String,
    currency: String
});

var EbayOrders = new Schema({
    id: {type: String, unique: true, required: true},
    order_status: String,
    items: [],
    payment_status: String,
    status: String,
    paid_time: Date,
    total: Number,
    address: {
        name: String,
        street1: String,
        street2: String,
        city: String,
        state: String,
        country: String,
        country_name: String,
        phone: String,
        postal_code: String
    }
});

var WalmartModel = mongoose.model('WalmartOrders', WalmartOrders);
var AmazonModel = mongoose.model('AmazonOrders', AmazonOrders);
var EbayModel = mongoose.model('EbayOrders', EbayOrders);

module.exports.WalmartModel = WalmartModel;
module.exports.AmazonModel = AmazonModel;
module.exports.EbayModel = EbayModel;
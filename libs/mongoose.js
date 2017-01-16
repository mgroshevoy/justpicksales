
var mongoose    = require('mongoose');

mongoose.connect('mongodb://localhost/justpicksales');
var db = mongoose.connection;

db.on('error', function (err) {
    console.error('connection error:', err.message);
});
db.once('open', function callback () {
    console.info("Connected to DB!");
});

var Schema = mongoose.Schema;

// Schemas
var WalmartOrders = new Schema({
    id: { type : String , unique : true, required : true },
    date: Date,
    url: String,
    address: String,
    total: String
});

var WalmartModel = mongoose.model('WalmartOrders', WalmartOrders);

module.exports.WalmartModel = WalmartModel;
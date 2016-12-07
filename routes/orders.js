const express = require('express');
const router = express.Router();

let orders = [];


//<img id="icImg" class="img img140" itemprop="image" src="http://i.ebayimg.com/images/g/3akAAOSwcLxYG2J5/s-l500.jpg" style="" clk="0" alt="Toy-Play-House-Happy-Home-Shopkins-Playset-Girls">
//"http://cgi.ebay.com/ws/eBayISAPI.dll?ViewItem&item=" + item_id
//http://www.ebay.com/itm/122225724269



/* GET orders page. */
router.get('/', function (req, res, next) {
    res.render('orders', {title: 'Orders'});
});

module.exports = router;

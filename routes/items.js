var User = require('../models/user');
var Openhab = require('../models/openhab');
var Item = require('../models/item');

exports.itemsget = function(req, res) {
    switch (req.query.sort) {
        default:
        case "name":
            var sortValue = {name: 'asc'};
            break;
        case "last_update":
            var sortValue = {last_update: 'desc'};
            break;
        case "status":
            var sortValue = {status: 'asc'};
            break;
    }
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            Item.find({openhab: openhab})
                .sort(sortValue)
                .lean()
                .exec(function(error, items) {
                    res.render('items', { items: items,
                        title: "Items", user: req.user, openhab: openhab,
                        errormessages:req.flash('error'), infomessages:req.flash('info') });
                });
        } else {

        }
    });
}

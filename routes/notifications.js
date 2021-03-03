var User = require('../models/user');
var Openhab = require('../models/openhab');
var Notification = require('../models/notification');
var logger = require('../logger');

exports.notificationsget = function(req, res) {
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            var filter = {user: req.user.id};
            Notification.find(filter)
                .limit(perPage)
                .skip(perPage * page)
                .sort({created: 'desc'})
                .lean()
                .exec(function(error, notifications) {
                    Notification.count().exec(function (err, count) {
                        res.render('notifications', { notifications: notifications, pages: count / perPage, page: page,
                            title: "Notifications", user: req.user, openhab: openhab,
                            errormessages:req.flash('error'), infomessages:req.flash('info') });
                    });
                });
        } else {

        }
    });
}

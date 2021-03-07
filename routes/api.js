var User = require('../models/user');
var Openhab = require('../models/openhab');
var Notification = require('../models/notification');
var logger = require('../logger');
var system = require('../system');

exports.notificationsget = function(req, res) {
    var limit = req.query.limit > 0 ? parseInt(req.query.limit) : 10,
    skip = req.query.skip > 0 ? parseInt(req.query.skip) : 0;
    Notification.find({user: req.user.id}, '-user')
        .limit(limit)
        .skip(skip)
        .sort({created: 'desc'})
        .exec(function(error, notifications) {
        if (!error) {
            res.send(notifications);
        } else {
            return res.status(500).json({
                errors: [{
                    message: "Error getting notifications"
                }]
            });
        }
    });
};

exports.notificationssettingsget = function(req, res) {
    var config = {};

    if (system.isGcmConfigured()) {
        config.gcm = {
            "senderId": system.getGcmSenderId()
        };
    }
    res.send(config);
};

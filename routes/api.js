var User = require('../models/user');
var Openhab = require('../models/openhab');
var Notification = require('../models/notification');
var logger = require('../logger');
var moment = require('moment');
var system = require('../system');

exports.notificationsget = function(req, res) {
    var limit = req.param('limit') > 0 ? req.param('limit') : 10,
    skip = req.param('skip') > 0 ? req.param('skip') : 0;
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
var Notification = require('../models/notification');
var UserDevice = require('../models/userdevice');
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

exports.hidenotification = function (req, res) {
    const deviceId = req.query['deviceId'];
    const persistedId = req.query['persistedId'];
    if (!deviceId || !persistedId) {
        return res.status(400).json({
            errors: [{
                message: "Invalid request"
            }]
        });
    }
    UserDevice.find({ owner: req.user.id }, function (error, userDevices) {
        const registrationIds = [];
        for (const uDevice of userDevices) {
            // Skip the device which sent notification hide itself
            if (uDevice.deviceId !== deviceId) {
                registrationIds.push(uDevice.androidRegistration);
            }
        }
        if (registrationIds.length < 0) {
            return;
        }
        firebase.hideNotification(registrationIds, persistedId);
    });
}

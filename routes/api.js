const Notification = require('../models/notification');
const UserDevice = require('../models/userdevice');
const logger = require('../logger');
const system = require('../system');
const firebase = require('../notificationsender/firebase');
const notificationSender = require("../notificationsender");

exports.notificationsget = function (req, res) {
    const limit = req.query.limit > 0 ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip > 0 ? parseInt(req.query.skip) : 0;
    Notification.find({ user: req.user.id }, '-user')
        .limit(limit)
        .skip(skip)
        .sort({ created: 'desc' })
        .exec(function (error, notifications) {
            if (!error) {
                res.status(200).json(notifications);
            } else {
                return res.status(500).json({
                    errors: [{
                        message: "Error getting notifications"
                    }]
                });
            }
        });
};

exports.notificationssettingsget = function (req, res) {
    const config = {};
    if (system.isGcmConfigured()) {
        config.gcm = {
            "senderId": system.getGcmSenderId()
        };
    }
    res.status(200).json(config);
};

exports.hidenotification = function (req, res) {
    const persistedId = req.params.id;
    const deviceId = req.query['deviceId']; //optional
    if (!persistedId) {
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
            if (uDevice.deviceId !== deviceId && uDevice.fcmRegistration) {
                registrationIds.push(uDevice.fcmRegistration);
            }
        }
        if (registrationIds.length > 0) {
            logger.debug(`Hiding notification ${persistedId} on device ${deviceId} to ${JSON.stringify(registrationIds)}`);
            firebase.hideNotification(registrationIds, persistedId);
        }
        return res.status(200).json({});
    });
}

exports.proxyurlget = function (req, res) {
    res.status(200).json({
        'url': system.getProxyURL()
    });
};

exports.appids = function (req, res) {
    res.status(200).json({
        'ios': system.getAppleId(),
        'android': system.getAndroidId()
    });
};

exports.sendnotification = function (req, res) {
    const data = req.body
    logger.debug(`sendNotificationToUser ${JSON.stringify(data)}`);
    notificationSender.sendNotification(req.user._id, data).then(() => {
        res.status(200).json("OK")
    }).catch(message => {
        res.status(500).json(message)
    });
}
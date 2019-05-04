const system = require('../system');
const Firebase = require('firebase-messaging');
const logger = require('../logger.js');
const firebaseClient = new Firebase(system.getGcmPassword());

const firebaseOptions = {
    delay_while_idle: false,
    priority: 'high'
};

function sendNotificationWithData(registrationIds, data) {
    redis.incr("androidNotificationId", function(error, androidNotificationId) {
        if (error) {
            return;
        }

        data.type = 'notification';
        data.notificationId = androidNotificationId;
        firebaseClient.message(registrationIds, data, firebaseOptions, function (result) {
            if (result.failure) {
                logger.error("openHAB-cloud: GCM send error: " + JSON.stringify(result));
            }
        });
    });
};

exports.sendMessageNotification = function(registrationIds, message) {
    var data = {
        message: message,
        timestamp: Date.now()
    };
    sendNotificationWithData(registrationIds, data);
};

exports.sendNotification = function(registrationIds, notification) {
    var data = {
        message: notification.message,
        severity: notification.severity,
        icon: notification.icon,
        persistedId: notification._id,
        timestamp: notification.created.getTime()
    };
    sendNotificationWithData(registrationIds, data);
};

exports.hideNotification = function(registrationIds, notificationId) {
    const data = {
        type: 'hideNotification',
        notificationId: notificationId
    };
    firebaseClient.message(registrationIds, data, firebaseOptions, function (result) {
        if (result.failure) {
            logger.error('openHAB-cloud: GCM send error: ' + result);
        }
    });
};

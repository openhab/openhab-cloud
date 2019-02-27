const system = require('../system');
const Firebase = require('firebase-messaging');
const logger = require('../logger.js');
const firebaseClient = new Firebase(system.getGcmPassword());

const firebaseOptions = {
    delay_while_idle: false
};

exports.sendNotification = function(registrationIds, message) {
    redis.incr("androidNotificationId", function(error, androidNotificationId) {
        if (error) {
            return;
        }

        const data = {
            type: 'notification',
            notificationId: androidNotificationId,
            message: message,
        };
        firebaseClient.message(registrationIds, data, firebaseOptions, function (result) {
            if (result.failure) {
                logger.error("openHAB-cloud: GCM send error: " + err);
            }
        });
    });
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

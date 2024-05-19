const system = require('../system');
const firebase = require('firebase-admin');
const logger = require('../logger.js');
const redis = require('../redis-helper');

if(system.isGcmConfigured()) {
    const serviceAccount = require(system.getFirebaseServiceFile());
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount)
    });
}

function sendNotificationWithData(registrationIds, data) {
    //TODO remove redis/notificationId as we are going to use persistedId
    return new Promise((resolve, reject) => {
        redis.incr("androidNotificationId", function (error, androidNotificationId) {
            if (error) {
                return;
            }
            data.type = 'notification';
            data.notificationId = androidNotificationId.toString();
            const message = {
                data: data,
                tokens: Array.isArray(registrationIds) ? registrationIds : [registrationIds],
                android: {
                    priority: 'high',
                }
            };
            firebase.messaging().sendMulticast(message)
                .then((response) => {
                    logger.info("Response: " + JSON.stringify(response));
                    resolve(androidNotificationId);
                })
                .catch(error => {
                    logger.error("GCM send error: ", error);
                    reject(error);
                });
        });
    });
};

exports.sendMessageNotification = function (registrationIds, message) {
    const data = {
        message: message,
        timestamp: Date.now().toString()
    };
    return sendNotificationWithData(registrationIds, data);
};

exports.sendNotification = function (registrationIds, notification) {
    const data = {
        message: notification.message,
        severity: notification.severity,
        icon: notification.icon,
        persistedId: notification._id.toString(),
        timestamp: notification.created.getTime().toString()
    };
    return sendNotificationWithData(registrationIds, data);
};

exports.hideNotification = function (registrationIds, notificationId) {
    const data = {
        type: 'hideNotification',
        notificationId: notificationId.toString()
    };
    firebase.messaging().sendToDevice(registrationIds, { data: data }, messagingOptions)
        .catch(error => {
            logger.error("GCM send error: ", error);
        });
};

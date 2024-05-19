const system = require('../system');
const firebase = require('firebase-admin');
const logger = require('../logger.js');
const redis = require('../redis-helper');

if (system.isGcmConfigured()) {
    const serviceAccount = require(system.getFirebaseServiceFile());
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount)
    });
}

function sendMessage(registrationIds, data) {
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
        })
        .catch(error => {
            logger.error("GCM send error: ", error);
        });
};

function sendIncrementingMessage(registrationIds, data) {
    //TODO remove redis/notificationId as we are going to use persistedId
    redis.incr("androidNotificationId", function (error, androidNotificationId) {
        if (error) {
            return;
        }
        data.notificationId = androidNotificationId.toString();
        sendMessage(registrationIds, data);
    });
};

exports.sendMessageNotification = function (registrationIds, message) {
    const data = {
        message: message,
        type : 'notification',
        timestamp: Date.now().toString()
    };
    sendIncrementingMessage(registrationIds, data);
};

exports.sendNotification = function (registrationIds, notification) {
    const data = {
        message: notification.message,
        type : 'notification',
        severity: notification.severity,
        icon: notification.icon,
        persistedId: notification._id.toString(),
        timestamp: notification.created.getTime().toString()
    };
    sendIncrementingMessage(registrationIds, data);
};

exports.hideNotification = function (registrationIds, notificationId) {
    const data = {
        type: 'hideNotification',
        notificationId: notificationId.toString()
    };
    sendMessage(registrationIds, data);
};

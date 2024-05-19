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

function sendNotificationWithData(registrationIds, data) {
    //TODO remove redis/notificationId as we are going to use persistedId
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
            })
            .catch(error => {
                logger.error("GCM send error: ", error);
            });
    });
};

exports.sendMessageNotification = function (registrationIds, message) {
    const data = {
        message: message,
        timestamp: Date.now().toString()
    };
    sendNotificationWithData(registrationIds, data);
};

exports.sendNotification = function (registrationIds, notification) {
    const data = {
        message: notification.message,
        severity: notification.severity,
        icon: notification.icon,
        persistedId: notification._id.toString(),
        timestamp: notification.created.getTime().toString()
    };
    endNotificationWithData(registrationIds, data);
};

exports.hideNotification = function (registrationIds, notificationId) {
    const data = {
        type: 'hideNotification',
        notificationId: notificationId.toString()
    };
    const message = {
        data: data,
        tokens: Array.isArray(registrationIds) ? registrationIds : [registrationIds],
        android: {
            priority: 'high',
        }
    };
    firebase.messaging().sendMulticast(message)
        .then((response) => {
            logger.info("Hide Notification Response: " + JSON.stringify(response));
        })
        .catch(error => {
            logger.error("Hide Notification GCM send error: ", error);
        });
};

const system = require('../system');
const firebase = require('firebase-admin');
const logger = require('../logger.js');
const redis = require('../redis-helper');
const uuid = require('uuid')

if (system.isGcmConfigured()) {
    const serviceAccount = require(system.getFirebaseServiceFile());
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount)
    });
}
    
function sendMessage(message) {
    firebase.messaging().sendMulticast(message)
        .then((response) => {
            logger.info("Response: " + JSON.stringify(response));
        })
        .catch(error => {
            logger.error("GCM send error: ", error);
        });
};

exports.sendNotification = function (registrationIds, notification, data) {
    // We can safely remove androidNotificationId, our android client  has removed the need for this, but i need to double check
    redis.incr("androidNotificationId", function (error, androidNotificationId) {
        if (error) {
            return;
        }
        //for IOS we need to set an actual notification payload so they show up when the app is not running
        //we can remove badge/sound/alert after our IOS app dynamically adds these 
        const apns = {
            payload: {
                aps: {
                    'mutable-content': 1, // Enables mutable content for iOS
                    badge: 0,
                    sound: { name: 'default' },
                    alert: { body: data.message },
                }
            }
        }
        const android = {
            priority: 'high',
        }

        const messageData = {
            message: notification.message,
            type: 'notification',
            severity: notification.severity || '',
            icon: notification.icon || '',
            persistedId: notification._id.toString(),
            timestamp: notification.created.getTime().toString(),
            notificationId: androidNotificationId.toString()
        };

        if (data) {
            Object.assign(messageData, data);
            if (data.actions instanceof Array) {
                notification.click_action = uuid.v1();
                //apns.payload.aps.category = uuid.v1();
            }
        }

        const message = {
            // notification: {
            //     body: notification.message,
            //     sound: "default",
            // },
            android: android,
            apns: apns,
            data: messageData,
            tokens: Array.isArray(registrationIds) ? registrationIds : [registrationIds],
        };
        sendMessage(message, messageData);
    });
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
    sendMessage(message, data);
};

const system = require('../system');
const firebase = require('firebase-admin');
const logger = require('../logger.js');
const redis = require('../redis-helper');
const crypto = require("crypto")

if (system.isGcmConfigured()) {
    const serviceAccount = require(system.getFirebaseServiceFile());
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount)
    });
}

function sendMessage(message) {
    firebase.messaging().sendMulticast(message)
        .then((response) => {
            logger.info("FCM Response: " + JSON.stringify(response));
        })
        .catch(error => {
            logger.error("FCM send error: ", error);
        });
};

exports.sendFCMNotification = function (registrationIds, notificationId, data) {
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

        const updatedData = {
            type: 'notification',
            severity: data.severity || '',
            icon: data.icon || '',
            persistedId: notificationId.toString(),
            timestamp: Date.now().toString(),
            notificationId: androidNotificationId.toString()
        };

        Object.assign(data, updatedData)

        if (data.actions) {
            if (data.actions instanceof Array) {
                data.actions = JSON.stringify(data.actions)
            }
            // for apple, create a unique hash for the category, secret sauce for dynamic actions
            apns.payload.aps.category = crypto.createHash('sha256').update(data.actions).digest('hex');
        }

        if(data.title){
            apns.payload.aps.alert.title = data.title
        }

        const message = {
            android: android,
            apns: apns,
            data: data,
            tokens: Array.isArray(registrationIds) ? registrationIds : [registrationIds],
        };

        sendMessage(message);
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

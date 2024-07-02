const system = require('../system');
const firebase = require('firebase-admin');
const logger = require('../logger.js');
const crypto = require("crypto");

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

exports.sendFCMNotification = function (registrationIds, notification) {
    let data = notification.payload;

    const apns = {
        payload: {
            aps: {}
        },
        headers: {}
    }

    const android = {
        priority: 'high',
    }

    // make sure all our values are strings per FCM requirements
    Object.keys(data).forEach(key => {
        const value = data[key];
        if(value === undefined){
            delete data[key]
        } else if (typeof value !== 'string') {
            data[key] = JSON.stringify(value)
        }
    })

    data.type = data.type || 'notification' // default to sending notifications

    // this a silent/background notification
    if (data.type === "hideNotification") {
        // required for silent notifications on IOS
        apns.payload.aps["content-available"] = 1
        apns.headers["apns-priority"] = "5"
    } else {
        // Normal notification
        data.persistedId = notification._id.toString()
        data.timestamp = notification.created.getTime().toString()

        // Setting title and body is really only necessary for the legacy IOS app (V1)
        // The non-legacy app will set these from the payload data before surfacing the notification
        apns.payload.aps = {
            'mutable-content': 1, // allows for background processing - required
            title: data.title,
            badge: 0,
            alert: { body: data.message },
            sound: { name: 'default' }
        }

        //set the user supplied id for the collapse header so notifications can be replaced with new ones
        const refId = data["reference-id"]
        if (refId) {
            apns.headers["apns-collapse-id"] = refId;
            android.collapseKey = refId;
        }

        if (data.actions) {
            // for apple, create a unique hash for the category, secret sauce for dynamic actions
            apns.payload.aps.category = crypto.createHash('sha256').update(data.actions).digest('hex');
        }
    }

    const message = {
        android: android,
        apns: apns,
        data: data,
        tokens: Array.isArray(registrationIds) ? registrationIds : [registrationIds]
    };
    console.info("sending message", message)
    //console.info("sending message", JSON.stringify(message, null, 2))
    sendMessage(message);
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

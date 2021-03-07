const system = require('./system');

/**
 * This module maintains XMPP connection to FCM to receive messages from Android
 * app.
 */
const ACK_MESSAGE_TYPE = 'ack';
const NACK_MESSAGE_TYPE = 'nack';
const { client, xml } = require("@xmpp/client");
const UserDevice = require('./models/userdevice'),
    UserDeviceLocationHistory = require('./models/userdevicelocationhistory'),
    firebase = require('./notificationsender/firebase'),
    logger = require('./logger.js');

logger.info('openHAB-cloud: Initializing XMPP connection to GCM');

const xmppClient = client({
    service: "xmpps://fcm-xmpp.googleapis.com:5235",
    domain: "gcm.googleapis.com",
    username: system.getGcmSenderId(),
    password: system.getGcmPassword(),
});

xmppClient.start().catch(err => {
    logger.error(`XMPP Error ${err}`);
});

xmppClient.on('online', function () {
    logger.info('openHAB-cloud: GCM XMPP connection is online');
});

function updateLocationOfDevice(messageData) {
    logger.info('openHAB-cloud: This is a location message');
    UserDevice.findOne({ androidRegistration: messageData.from }, function (error, userDevice) {
        let newLocation;

        if (error) {
            logger.warn('openHAB-cloud: Error finding user device: ' + error);
            return;
        }
        if (!userDevice) {
            logger.warn('openHAB-cloud: Unable to find user device with reg id = ' + messageData.from);
            return;
        }

        userDevice.globalLocation = [messageData.data.latitude, messageData.data.longitude];
        userDevice.globalAccuracy = messageData.data.accuracy;
        userDevice.globalAltitude = messageData.data.altitude;
        userDevice.lastGlobalLocation = new Date(messageData.data.timestamp);
        userDevice.save();
        newLocation = new UserDeviceLocationHistory({ userDevice: userDevice.id });
        newLocation.globalLocation = [messageData.data.latitude, messageData.data.longitude];
        newLocation.when = new Date(messageData.data.timestamp);
        newLocation.globalAltitude = messageData.data.altitude;
        newLocation.globalAccuracy = messageData.data.accuracy;
        newLocation.save();
    });
}

function hideNotificationInfo(messageData) {
    logger.info('openHAB-cloud: This is hideNotification message');
    UserDevice.findOne({ androidRegistration: messageData.from }, function (error, userDevice) {
        if (error) {
            logger.warn('openHAB-cloud: Error finding user device: ' + error);
            return;
        }

        if (!userDevice) {
            logger.warn('openHAB-cloud: Unable to find user device with reg id = ' + messageData.from);
            return;
        }

        UserDevice.find({ owner: userDevice.owner }, function (error, userDevices) {
            // TODO: now send hideNotification data to all devices except the source one
            const registrationIds = [];
            for (let i = 0; i < userDevices.length; i++) {
                const uDevice = userDevices[i];
                // Skip the device which sent notification hide itself
                if (uDevice.androidRegistration !== userDevice.androidRegistration) {
                    registrationIds.push(uDevice.androidRegistration);
                }
            }
            if (registrationIds.length < 0) {
                return;
            }

            firebase.hideNotification(registrationIds, messageData.data.notificationId);
        });
    });
}

xmppClient.on('stanza', function (stanza) {
    if (!stanza.is('message') || stanza.attrs.type === 'error') {
        return;
    }

    logger.info('openHAB-cloud: GCM XMPP received message');

    const messageData = JSON.parse(stanza.getChildText('gcm'));
    if (messageData && messageData.message_type === ACK_MESSAGE_TYPE || messageData.message_type === NACK_MESSAGE_TYPE) {
        return;
    }

    const ackMsg = xml('message');
    ackMsg.c('gcm', { xmlns: 'google:mobile:data' })
        .t(JSON.stringify({
            'to': messageData.from,
            'message_id': messageData.message_id,
            'message_type': ACK_MESSAGE_TYPE
        }));

    xmppClient.send(ackMsg);

    logger.info('openHAB-cloud: GCM XMPP ack sent');
    if (messageData.data.type === 'location') {
        updateLocationOfDevice(messageData);
    }

    if (messageData.data.type === 'hideNotification') {
        hideNotificationInfo(messageData);
    }
});

xmppClient.on('error', function (error) {
    logger.warn('openHAB-cloud: GCM XMPP error: ' + error);
});

module.exports = xmppClient;

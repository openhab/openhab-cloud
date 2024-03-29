const system = require('./system');

/**
 * This module maintains XMPP connection to FCM to receive messages from Android
 * app.
 */
const ACK_MESSAGE_TYPE = 'ack';
const NACK_MESSAGE_TYPE = 'nack';
const { client, xml } = require("@xmpp/client");
const UserDevice = require('./models/userdevice'),
    firebase = require('./notificationsender/firebase'),
    logger = require('./logger.js');

logger.info('Initializing XMPP connection to GCM');

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
    logger.info('GCM XMPP connection is online');
});

function hideNotificationInfo(messageData) {
    logger.info('This is hideNotification message');
    UserDevice.findOne({ androidRegistration: messageData.from }, function (error, userDevice) {
        if (error) {
            logger.warn('Error finding user device: ' + error);
            return;
        }

        if (!userDevice) {
            logger.warn('Unable to find user device with reg id = ' + messageData.from);
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

    logger.info('GCM XMPP received message');

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

    logger.info('GCM XMPP ack sent');

    if (messageData.data.type === 'hideNotification') {
        hideNotificationInfo(messageData);
    }
});

xmppClient.on('error', function (error) {
    logger.warn('GCM XMPP error: ' + error);
});

module.exports = xmppClient;

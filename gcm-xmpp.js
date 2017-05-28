var system = require('./system');

/*
 This module maintains XMPP connection to GCM to receive messages from Android
 app.
 */

var UserDevice = require('./models/userdevice'),
    UserDeviceLocationHistory = require('./models/userdevicelocationhistory'),
    xmpp = require('node-xmpp'),
    logger = require('./logger.js'),
    xmppOptions = {
        type: 'client',
        jid: system.getGcmJid(),
        password: system.getGcmPassword(),
        port: 5235,
        host: 'gcm.googleapis.com',
        legacySSL: true,
        preferredSaslMechanism : 'PLAIN'
    },
    xmppClient, gcmSender, gcm;

logger.info('openHAB-cloud: Initializing XMPP connection to GCM');

xmppClient = new xmpp.Client(xmppOptions);
gcmSender = require('./gcmsender.js');
gcm = require('node-gcm');

xmppClient.on('online', function() {
    logger.info('openHAB-cloud: GCM XMPP connection is online');
});


xmppClient.on('stanza', function(stanza) {
    if (stanza.is('message') && stanza.attrs.type !== 'error') {
        var messageData = JSON.parse(stanza.getChildText('gcm'));

        logger.info('openHAB-cloud: GCM XMPP received message');

        if (messageData && messageData.message_type !== 'ack' && messageData.message_type !== 'nack') {
            var ackMsg = new xmpp.Element('message')
                .c('gcm', { xmlns: 'google:mobile:data' })
                .t(JSON.stringify({
                    'to':messageData.from,
                    'message_id': messageData.message_id,
                    'message_type':'ack'
                }));

            xmppClient.send(ackMsg);

            logger.info('openHAB-cloud: GCM XMPP ack sent');
            if (messageData.data.type === 'location') {
                logger.info('openHAB-cloud: This is a location message');
                UserDevice.findOne({androidRegistration: messageData.from}, function (error, userDevice) {
                    var newLocation;

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
                    newLocation = new UserDeviceLocationHistory({userDevice: userDevice.id});
                    newLocation.globalLocation = [messageData.data.latitude, messageData.data.longitude];
                    newLocation.when = new Date(messageData.data.timestamp);
                    newLocation.globalAltitude = messageData.data.altitude;
                    newLocation.globalAccuracy = messageData.data.accuracy;
                    newLocation.save();
                });
            } else if (messageData.data.type === 'hideNotification') {
                logger.info('openHAB-cloud: This is hideNotification message');
                UserDevice.findOne({androidRegistration: messageData.from}, function (error, userDevice) {
                    if (error) {
                        logger.warn('openHAB-cloud: Error finding user device: ' + error);
                        return;
                    }

                    if (!userDevice) {
                        logger.warn('openHAB-cloud: Unable to find user device with reg id = ' + messageData.from);
                        return;
                    }

                    UserDevice.find({owner: userDevice.owner}, function (error, userDevices) {
                        var gcmMessage;

                        // TODO: now send hideNotification message to all devices except the source one
                        var registrationIds = [];
                        for (var i=0; i<userDevices.length; i++) {
                            var uDevice = userDevices[i];
                            // Skip the device which sent notification hide itself
                            if (uDevice.androidRegistration !== userDevice.androidRegistration) {
                                registrationIds.push(uDevice.androidRegistration);
                            }
                        }
                        if (registrationIds.length < 0) {
                            return;
                        }
                        gcmMessage = new gcm.Message({
                            delayWhileIdle: false,
                            data: {
                                type: 'hideNotification',
                                notificationId: messageData.data.notificationId
                            }
                        });
                        gcmSender.send(gcmMessage, registrationIds, 4, function (err, result) {
                            if (err) {
                                logger.error('mopenHAB-cloud: GCM send error: ' + err);
                            }
                        });
                    });
                });
            }
        } else {
            logger.info('openHAB-cloud: GCM XMPP message is ack or nack, ignoring');
        }
    }
});

xmppClient.on('error', function (error) {
    logger.warn('openHAB-cloud: GCM XMPP error: ' + error);
});

module.exports = xmppClient;

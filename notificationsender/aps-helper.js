var apn = require('apn'),
    app = require('./../app'),
    logger = require('./../logger'),
    apnConnection = new apn.Connection(app.config.apn);

apnConnection.on('connected', function () {
    logger.info('openHAB-cloud: APN connected');
});

apnConnection.on('transmitted', function (notification, device) {
    logger.info('APN notification transmitted to:' + device.token.toString('hex'));
});

apnConnection.on('transmissionError', function (errCode, notification, device) {
    logger.error('openHAB-cloud: APN notification caused error: ' + errCode + ' for device ', device, notification);
});

apnConnection.on('timeout', function () {
    logger.error('openHAB-cloud: APN connection Timeout');
});

apnConnection.on('disconnected', function () {
    logger.error('openHAB-cloud: APN disconnected');
});

apnConnection.on('socketError', logger.error);

module.exports.test = function (deviceToken) {
    var myDevice = new apn.Device(deviceToken);
    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 0;
    note.sound = 'ping.aiff';
    note.alert = {};
    note.alert.body = 'openHAB is offline';
    note.payload = {'messageFrom': 'Caroline'};
    apnConnection.pushNotification(note, myDevice);
}

module.exports.sendAppleNotification = function (deviceToken, message, payload) {
    var myDevice = new apn.Device(deviceToken);
    var note = new apn.Notification(payload);
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 0;
    note.sound = 'ping.aiff';
    note.alert = {};
    note.alert.body = message;
    apnConnection.pushNotification(note, myDevice);
}

const { APNS, Notification, Errors } = require('apns2'),
    app = require('./../app'),
    logger = require('./../logger'),
    client = new APNS({
        ...app.config.apn,
        signingKey: fs.readFileSync(`${app.config.apn.signingKey}`)
    });

client.on(Errors.error, (err) => {
    logger.error(`openHAB-cloud: APN error ${err.reason} ${err.statusCode} ${err.notification.deviceToken}`)
})

module.exports.sendAppleNotification = function (deviceToken, message, payload) {
    logger.debug(`aps-helper sending ${message} to device ${deviceToken}`)
    const notification = new Notification(deviceToken, {
        aps: {
            badge: 0,
            sound: { name: 'default' },
            alert: { body: message }
        },
        ...(payload)
    })
    client.send(notification).catch(err => { });
}

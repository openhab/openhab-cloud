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
    logger.error(`aps-helper sending ${message} to device ${deviceToken}`)
    const notification = new Notification(deviceToken, {
        aps: {
            alert: {
                body: message,
                badge: 0,
                sound: 'default'
            }
        },
        ...(payload)
    })
    client.send(notification).catch(err => {});
}

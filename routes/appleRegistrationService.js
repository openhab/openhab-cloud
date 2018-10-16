var UserDevice = require('../models/userdevice');
var logger = require('../logger');

/**
 * registers the apple device, which is request by this request, to the logged in user, or upgrades it,
 * if it is already registered.
 *
 * @param req
 * @param res
 */
module.exports = function (req, res) {
    if (!req.query.hasOwnProperty('regId') || !req.query.hasOwnProperty('deviceId')) {
        res.send(404, 'Parameters missing');
        return;
    }
    var regId = req.query['regId'];
    var deviceId = req.query['deviceId'];
    var deviceModel = req.query['deviceModel'];

    UserDevice.findOne({
        owner: req.user.id,
        deviceType: 'ios',
        deviceId: deviceId
    }, function (error, userDevice) {
        if (error) {
            logger.warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }
        if (userDevice) {
            // If found, update device token and save
            logger.info('openHAB-cloud: Found iOS device for user ' + req.user.username + ', updating');
            userDevice.iosDeviceToken = regId;
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, add new device registration
            logger.info('openHAB-cloud: Registering new iOS device for user ' + req.user.username);
            userDevice = new UserDevice({
                owner: req.user.id,
                deviceType: 'ios',
                deviceId: deviceId,
                iosDeviceToken: regId,
                deviceModel: deviceModel,
                lastUpdate: new Date(),
                registered: new Date()
            });
            userDevice.save(function (error) {
                if (error) {
                    logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Added');
        }
    });
};
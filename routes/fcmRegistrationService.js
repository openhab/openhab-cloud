const UserDevice = require('../models/userdevice');
const logger = require('../logger');

/**
 * Registers a device of the request to the logged in user, if it is not already registered,
 * otherwise it will be updated.
 *
 * @param req
 * @param res
 */
exports.registerAndroid = function (req, res) {
    register(req, res, 'android');
};

exports.registerIos = function (req, res) {
    register(req, res, 'ios');
};

function register(req, res, deviceType) {
    if (!req.query.hasOwnProperty('regId') || !req.query.hasOwnProperty('deviceId')) {
        res.send(404, 'Parameters missing');
        return;
    }
    const regId = req.query['regId'];
    const deviceId = req.query['deviceId'];
    const deviceModel = req.query['deviceModel'];

    // Try to find user device by device Id
    UserDevice.findOne({
        owner: req.user.id,
        deviceType: deviceType,
        deviceId: deviceId
    }, function (error, userDevice) {
        if (error) {
            logger.warn('Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }
        if (userDevice) {
            // If found, update the changed registration id
            logger.info(`Found an ${deviceType} device for user ${req.user.username}, updating`);
            userDevice.fcmRegistration = regId;
            userDevice.lastUpdate = new Date();
        } else {
            userDevice = new UserDevice({
                owner: req.user.id,
                deviceType: deviceType,
                deviceId: deviceId,
                fcmRegistration: regId,
                deviceModel: deviceModel,
                lastUpdate: new Date(),
                registered: new Date()
            });
        }
        userDevice.save(function (error) {
            if (error) {
                logger.error('Error saving user device: ' + error);
                res.send(500, 'Error Saving Registration');
            } else {
                res.send(200, 'Updated');
            }
        });
    });
}
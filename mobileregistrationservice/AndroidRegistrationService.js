var inherits = require('util').inherits,
    GenericRegistrationService = require('./GenericRegistrationService'),
    UserDevice = require('../models/userdevice');

function AndroidRegistrationService () {
    GenericRegistrationService.apply(this, arguments);
}

inherits(AndroidRegistrationService, GenericRegistrationService);

/**
 * Registers the Android device of the request to the logged in user, if it is not already registered,
 * otherwise it will be updated.
 *
 * @param req
 * @param res
 */
AndroidRegistrationService.prototype.register = function (req, res) {
    var self = this;

    if (!this.validateRequest(req, res)) {
        return;
    }

    // Try to find user device by device Id
    UserDevice.findOne({
        owner: req.user.id,
        deviceType: 'android',
        deviceId: this.getDeviceId()
    }, function (error, userDevice) {
        if (error) {
            self.getLogger().warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }

        if (userDevice) {
            // If found, update the changed registration id
            self.getLogger().info('openHAB-cloud: Found an Android device for user ' + req.user.username + ', updating');
            userDevice.androidRegistration = self.getRegistrationId();
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    self.getLogger().error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, try to find device by registration id. Sometimes android devices change their
            // ids dynamically, while google play services continue to return the same registration id
            // so this is still the same device and we don't want any duplicates
            self.findAndroidDeviceByRegistrationId(req, self.getRegistrationId(), res, self.getDeviceId(), self.getDeviceModel());
        }
    });
};

/**
 * Tries to find an android device using the registration ID and sets the given deviceId to this UserDevice.
 *
 * @param req
 * @param registrationId
 * @param res
 * @param deviceId
 * @param deviceModel
 */
AndroidRegistrationService.prototype.findAndroidDeviceByRegistrationId = function (req, registrationId, res, deviceId, deviceModel) {
    var self = this;

    UserDevice.findOne({
            owner: req.user.id,
            deviceType: 'android',
            androidRegistration: registrationId
        },
        function (error, userDevice) {
            if (error) {
                self.getLogger().warn('openHAB-cloud: Error looking up device: ' + error);
                res.send(500, 'Internal server error');
                return;
            }
            if (userDevice) {
                // If found, update the changed device id
                userDevice.deviceId = deviceId;
                userDevice.lastUpdate = new Date();
                userDevice.save(function (error) {
                    if (error) {
                        self.getLogger().error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Updated');
            } else {
                // If not found, finally register a new one
                userDevice = new UserDevice({
                    owner: req.user.id,
                    deviceType: 'android',
                    deviceId: deviceId,
                    androidRegistration: registrationId,
                    deviceModel: deviceModel,
                    lastUpdate: new Date(),
                    registered: new Date()
                });
                userDevice.save(function (error) {
                    if (error) {
                        self.getLogger().error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Added');
            }
        });
};

module.exports = AndroidRegistrationService;
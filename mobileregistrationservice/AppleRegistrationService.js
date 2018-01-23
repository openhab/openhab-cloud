var inherits = require('util').inherits,
    GenericRegistrationService = require('./GenericRegistrationService'),
    UserDevice = require('../models/userdevice');

function AppleRegistrationService () {
    GenericRegistrationService.apply(this, arguments);
}

inherits(AppleRegistrationService, GenericRegistrationService);

/**
 * registers the apple device, which is request by this request, to the logged in user, or upgrades it,
 * if it is already registered.
 *
 * @param req
 * @param res
 */
AppleRegistrationService.prototype.register = function (req, res) {
    var self = this;

    if (!this.validateRequest(req, res)) {
        return;
    }

    UserDevice.findOne({
        owner: req.user.id,
        deviceType: 'ios',
        deviceId: this.getDeviceId()
    }, function (error, userDevice) {
        if (error) {
            self.getLogger().warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }
        if (userDevice) {
            // If found, update device token and save
            self.getLogger().info('openHAB-cloud: Found iOS device for user ' + req.user.username + ', updating');
            userDevice.iosDeviceToken = self.getRegistrationId();
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    self.getLogger().error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, add new device registration
            self.getLogger().info('openHAB-cloud: Registering new iOS device for user ' + req.user.username);
            userDevice = new UserDevice({
                owner: req.user.id,
                deviceType: 'ios',
                deviceId: self.getDeviceId(),
                iosDeviceToken: self.getRegistrationId(),
                deviceModel: self.getDeviceModel(),
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

module.exports = AppleRegistrationService;
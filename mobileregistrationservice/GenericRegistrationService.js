var GenericRegistrationService = function (logger) {
    this.registrationId = 0;
    this.deviceId = 'unknown';
    this.deviceModel = 'unknown';
    this.log = logger;
};

/**
 * Validates the given request and, if the validation fails, sets the passed response accordingly.
 *
 * @param req
 * @param res
 * @return {boolean} True, if the validation succeeded, false otherwise.
 */
GenericRegistrationService.prototype.validateRequest = function (req, res) {
    if (!req.query.hasOwnProperty('regId')) {
        res.send(404, 'Parameters missing');
        return false;
    }
    this.setRegistrationId(req.query['regId']);
    if (req.query.hasOwnProperty('deviceId')) {
        this.setDeviceId(req.query['deviceId']);
    }

    if (req.query.hasOwnProperty('deviceModel')) {
        this.setDeviceModel(req.query['deviceModel']);
    }

    return true;
};

/**
 * Returns the logger for this service.
 *
 * @return {logger}
 */
GenericRegistrationService.prototype.getLogger = function () {
    return this.log;
};

/**
 * Sets the registration ID, which will later be used to register the device.
 *
 * @param regId
 */
GenericRegistrationService.prototype.setRegistrationId = function (regId) {
    this.registrationId = regId;
};

/**
 * Returns the set registration ID from the request.
 *
 * @return {number|*}
 */
GenericRegistrationService.prototype.getRegistrationId = function () {
    return this.registrationId;
};

/**
 * Sets the device ID.
 *
 * @param deviceId
 */
GenericRegistrationService.prototype.setDeviceId = function (deviceId) {
    this.deviceId = deviceId;
};

/**
 * Returns the device ID, if it was set before, otherwise this function returns 'unknown'.
 *
 * @return {string}
 */
GenericRegistrationService.prototype.getDeviceId = function () {
    return this.deviceId;
};

/**
 * Sets the device model.
 *
 * @param deviceModel
 */
GenericRegistrationService.prototype.setDeviceModel = function (deviceModel) {
    this.deviceModel = deviceModel;
};

/**
 * Returns the device model, if it was set before, otherwise 'unknown' will be returned.
 *
 * @return {string}
 */
GenericRegistrationService.prototype.getDeviceModel = function () {
    return this.deviceModel;
};

module.exports = GenericRegistrationService;
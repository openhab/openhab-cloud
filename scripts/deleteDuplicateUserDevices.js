const mongoose = require('mongoose'),
    logger = require('../logger.js'),
    config = require('../config.json'),
    UserDevice = require('../models/userdevice'),
    system = require('../system'),
    MongoConnect = require('../system/mongoconnect');

system.setConfiguration(config);

const mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);

logger.info('Looking for all registered devices...');
function deleteDuplicateUserDevices(err, devices) {
    if (err) {
        logger.error('Could not load all devices to fix duplicates.', err);
    }

    logger.info('Found ' + devices.length + ' devices...');
    const alreadyRegisteredDeviceId = [];
    const alreadyRegisteredAndroidRegistration = [];
    const alreadyRegisteredIOSToken = [];
    devices.forEach(function(device) {
        if (
            !alreadyRegisteredDeviceId.includes(device.deviceId) &&
            !alreadyRegisteredAndroidRegistration.includes(device.androidRegistration) &&
            !alreadyRegisteredIOSToken.includes(device.iosDeviceToken)
        ) {
            alreadyRegisteredDeviceId.push(device.deviceId);
            alreadyRegisteredAndroidRegistration.push(device.androidRegistration);
            alreadyRegisteredIOSToken.push(device.iosDeviceToken);
            return;
        }

        logger.info('Remove duplicated device with deviceId ' + device.deviceId + ' and ID ' + device.id);
        device.remove();
    });

    if (alreadyRegisteredDeviceId.length === devices.length) {
        logger.info('No duplicated devices found.');
    } else {
        logger.info('All duplicated devices should be removed now.');
    }

    process.exit(0);
}

UserDevice.find({}, deleteDuplicateUserDevices);

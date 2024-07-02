const Notification = require('../models/notification');
const UserDevice = require('../models/userdevice');
const logger = require('../logger');
const firebase = require('./firebase');
const aps = require("./aps-helper")
const maxSizeInBytes = 1048576; //1MB

function sendNotification(userId, data) {
    return new Promise((resolve, reject) => {

        const jsonString = JSON.stringify(data);
        const jsonSizeInBytes = Buffer.byteLength(jsonString, 'utf8');
    
        // Check if the JSON size exceeds the limit
        if (jsonSizeInBytes > maxSizeInBytes) {
            reject(`JSON data exceeds the maximum allowed size of ${maxSizeInBytes} bytes.`)
        }

        var fcmRegistrations = [];
        var iosDeviceTokens = [];
        data.tag = data.tag || data.severity // tag is replacing severity in OH 4.2
        var newNotification = new Notification({
            user: userId,
            message: data.message,
            icon: data.icon,
            severity: data.tag, //legacy field
            payload: data
        });
        newNotification.save(function (error) {
            if (error) {
                reject(`Error saving notification ${error}`)
            }
            UserDevice.find({
                owner: userId
            }, function (error, userDevices) {
                if (error) {
                    reject(`Error fetching devices for user ${error}`)
                }
                if (!userDevices) {
                    reject("No registered devices")
                }

                userDevices.forEach(device => {
                    if (device.fcmRegistration) {
                        fcmRegistrations.push(device.fcmRegistration);
                    } else if (device.deviceType === 'ios') {
                        iosDeviceTokens.push(device.iosDeviceToken);
                    }
                });

                // If we found any FCM devices, send notification
                if (fcmRegistrations.length > 0) {
                    firebase.sendFCMNotification(fcmRegistrations, newNotification);
                }

                // If we found any ios devices, send notification
                if (iosDeviceTokens.length > 0) {
                    var payload = {
                        severity: newNotification.severity,
                        icon: newNotification.icon,
                        persistedId: newNotification._id,
                        timestamp: newNotification.created.getTime()
                    };

                    iosDeviceTokens.forEach(token => {
                        aps.sendAppleNotification(token, newNotification.message, payload);
                    });
                }
                resolve()
            });
        });
    });
}

module.exports = {
    ...firebase,
    ...aps,
    sendNotification
}


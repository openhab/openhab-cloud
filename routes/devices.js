const User = require('../models/user');
const Openhab = require('../models/openhab');
const UserDevice = require('../models/userdevice');
const logger = require('../logger');
const mongoose = require('mongoose'),
    Schema = mongoose.Schema;
const ObjectId = mongoose.SchemaTypes.ObjectId;
const appleSender = require('../notificationsender/aps-helper');
const firebase = require('../notificationsender/firebase');
const Notification = require('../models/notification');

const form = require('express-form'),
    field = form.field,
    system = require('../system');


exports.devicesget = function (req, res) {
    UserDevice.find({ owner: req.user.id }, function (error, userDevices) {
        let selectedDeviceId = "";
        if (!userDevices || error) {
            userDevices = [];
        } else {
            if (req.params.hasOwnProperty('id')) {
                selectedDeviceId = req.params.id;
            } else {
                if (userDevices.length > 0)
                    selectedDeviceId = userDevices[0]._id;
                else
                    selectedDeviceId = "";
            }
        }
        let selectedDeviceArrayId = 0;
        for (let i = 0; i < userDevices.length; i++) {
            if (userDevices[i]._id == selectedDeviceId) {
                selectedDeviceArrayId = i;
            }
        }

        res.render('devices', {
            userDevices: userDevices,
            title: "Devices", user: req.user, selectedDeviceId: selectedDeviceId,
            selectedDeviceArrayId: selectedDeviceArrayId,
            baseUrl: system.getBaseURL(), appleLink: system.getAppleLink(), androidLink: system.getAndroidLink(),
            errormessages: req.flash('error'), infomessages: req.flash('info')
        });
    });
}

exports.devicessendmessagevalidate = form(
    field("messagetext", "Message text").trim().required()
);

exports.devicessendmessage = function (req, res) {
    if (!req.form.isValid) {
        req.user.openhab(function (error, openhab) {
            res.redirect('/devices/');
        });
    } else {
        logger.info("sending message to device " + req.params.id);
        const sendMessageDeviceId = mongoose.Types.ObjectId(req.params.id);
        const message = req.form.messagetext;
        var newNotification = new Notification({
            user: req.user.id,
            message: message
        });
        newNotification.save(function (error) {
            if (error) {
                logger.error('Error saving notification: %s', error);
            } else {
                UserDevice.findOne({ owner: req.user.id, _id: sendMessageDeviceId }, function (error, sendMessageDevice) {
                    if (!error && sendMessageDevice) {
                        if (sendMessageDevice.fcmRegistration) {
                            firebase.sendNotification(sendMessageDevice.fcmRegistration, newNotification);
                        } else if (sendMessageDevice.iosDeviceToken) {
                            appleSender.sendAppleNotification(sendMessageDevice.iosDeviceToken, message);
                        }
                        req.flash('info', 'Your message was sent');
                        res.redirect('/devices/' + sendMessageDevice._id);
                    } else {
                        req.flash('error', 'There was an error processing your request');
                        res.redirect('/devices/' + sendMessageDevice._id);
                    }
                });
            }
        });
    }
}

exports.devicesdelete = function (req, res) {
    logger.info("deleting device " + req.params.id);
    const deleteId = mongoose.Types.ObjectId(req.params.id);
    UserDevice.findOne({ owner: req.user.id, _id: deleteId }, function (error, userDevice) {
        if (!error && userDevice) {
            userDevice.remove();
        }
        res.redirect('/devices');
    });
};

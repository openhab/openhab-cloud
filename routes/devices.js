var User = require('../models/user');
var Openhab = require('../models/openhab');
var UserDevice = require('../models/userdevice');
var logger = require('../logger');
var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;
var UserDeviceLocationHistory = require('../models/userdevicelocationhistory');
var appleSender = require('../notificationsender/aps-helper');
var firebase = require('../notificationsender/firebase');
var redis = require('../redis-helper');
var form = require('express-form'),
    field = form.field,
    system = require('../system');

exports.devicesget = function(req, res) {
    UserDevice.find({owner: req.user.id}, function(error, userDevices) {
        if (!userDevices || error) {
            var userDevices = [];
            var selectedDeviceId = "";
        } else {
            if (req.params.hasOwnProperty('id')) {
                var selectedDeviceId = req.params.id;
            } else {
                if (userDevices.length > 0)
                    var selectedDeviceId = userDevices[0]._id;
                else
                    var selectedDeviceId = "";
            }
        }
        var selectedDeviceArrayId = 0;
        for (var i = 0; i < userDevices.length; i++) {
            if (userDevices[i]._id == selectedDeviceId) {
                selectedDeviceArrayId = i;
            }
        }
        UserDeviceLocationHistory.find({userDevice: selectedDeviceId}, function(error, locationHistory) {
//            logger.info("Location history size = " + locationHistory.length);
            res.render('devices', { userDevices: userDevices,
                title: "Devices", user: req.user, selectedDeviceId: selectedDeviceId,
                selectedDeviceArrayId: selectedDeviceArrayId, locationHistory: locationHistory,
                baseUrl: system.getBaseURL(), appleLink: system.getAppleLink(), androidLink: system.getAndroidLink(),
                errormessages:req.flash('error'), infomessages:req.flash('info') });
        });
    });
}

exports.devicessendmessagevalidate = form(
    field("messagetext", "Message text").trim().required()
);

exports.devicessendmessage = function(req, res) {
    if (!req.form.isValid) {
        req.user.openhab(function(error, openhab) {
            res.redirect('/devices/');
        });
    } else {
        logger.info("openHAB-cloud: sending message to device " + req.params.id);
        var sendMessageDeviceId = mongoose.Types.ObjectId(req.params.id);
        var message = req.form.messagetext;
        UserDevice.findOne({owner: req.user.id, _id: sendMessageDeviceId}, function (error, sendMessageDevice) {
            if (!error && sendMessageDevice) {
                if (sendMessageDevice.deviceType == 'ios') {
                    appleSender.sendAppleNotification(sendMessageDevice.iosDeviceToken, message);
                }
                if (sendMessageDevice.deviceType == 'android') {
                    firebase.sendMessageNotification(sendMessageDevice.androidRegistration, message);
                }
                req.flash('info', 'Your message was sent');
                res.redirect('/devices/' + sendMessageDevice._id);
            } else {
                req.flash('error', 'There was an error processing your request');
                res.redirect('/devices/' + sendMessageDevice._id);
            }
        });
    }
}

exports.devicesdelete = function(req, res) {
    logger.info("openHAB-cloud: deleting device " + req.params.id);
    var deleteId = mongoose.Types.ObjectId(req.params.id);
    UserDevice.findOne({owner: req.user.id, _id: deleteId}, function(error, userDevice) {
        if (!error && userDevice) {
            userDevice.remove();
        }
        res.redirect('/devices');
    });
};

var User = require('../models/user');
var Openhab = require('../models/openhab');
var UserDevice = require('../models/userdevice');
var logger = require('../logger');
var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;
var UserDeviceLocationHistory = require('../models/userdevicelocationhistory');
var gcm = require('node-gcm');
var gcmSender = require('../gcmsender.js')
    , appleSender = require('../aps-helper');
var redis = require('../redis-helper');
var OAuth2Token = require('../models/oauth2token');

exports.applicationsget = function(req, res) {
    OAuth2Token.find({user: req.user.id})
        .populate('oAuthClient')
        .exec(function(error, oauth2tokens) {
            if (!error && oauth2tokens) {
                res.render('applications', { oauth2tokens: oauth2tokens,
                    title: "Applications", user: req.user,
                    errormessages:req.flash('error'), infomessages:req.flash('info') });
            } else {
                res.render('applications', { oauth2tokens: oauth2tokens,
                    title: "Applications", user: req.user,
                    errormessages:req.flash('error'), infomessages:req.flash('info') });
            }
    });
}

exports.applicationsdelete = function(req, res) {
    logger.info("deleting application " + req.params.id);
    var deleteId = mongoose.Types.ObjectId(req.params.id);
    OAuth2Token.findOne({user: req.user.id, _id: deleteId}, function(error, oauth2token) {
        if (!error && oauth2token) {
//            logger.info("found device");
            oauth2token.remove();
        }
        res.redirect('/applications');
    });
}

var User = require('../models/user');
var Openhab = require('../models/openhab');
var Enrollment = require('../models/enrollment');
var Invitation = require('../models/invitation');
var OAuth2Client = require('../models/oauth2client');
var logger = require('../logger');
var redis = require('../redis-helper');

exports.staffget = function(req, res) {
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            var filter = {invited: null};
            Enrollment.find(filter)
                .limit(perPage)
                .skip(perPage * page)
                .sort({created: 'asc'})
                .exec(function(error, enrollments) {
                    Enrollment.count().exec(function (err, count) {
                        res.render('staff/staff', { enrollments: enrollments, pages: count / perPage, page: page,
                            title: "Enrollments", user: req.user, openhab: openhab,
                            errormessages:req.flash('error'), infomessages:req.flash('info') });
                    });
                });
        } else {

        }
    });
}

exports.statsget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            redis.mget(["openhabCount", "openhabOnlineCount", "userCount", "invitationUsedCount", "invitationUnusedCount",
                "userDeviceCount", "last5MinStatTimestamp"], function(err, response) {
                if (!err) {
                    res.render('staff/stats', { openhabCount: response[0], openhabOnlineCount: response[1],
                        userCount: response[2], invitationUsedCount: response[3], invitationUnusedCount: response[4],
                        userDeviceCount: response[5], last5MinStatTimestamp: response[6],
                        title: "Stats", user: req.user, openhab: openhab,
                        errormessages:req.flash('error'), infomessages:req.flash('info') });
                } else {

                }
            });
        }
    });
}

exports.processenroll = function(req, res) {
    var enrollId = req.params.id;
    Enrollment.findOne({_id: enrollId}, function(error, enrollment) {
        if (!error && enrollment) {
            Invitation.send(enrollment.email, function(error, invite) {
                if (!error) {
                    enrollment.invited = new Date;
                    enrollment.save();
                    req.flash('info', 'Invitation sent!');
                    res.redirect('/staff');
                } else {
                    req.flash('error', 'There was an error while processing your request');
                    res.redirect('/staff');
                }
            });
        } else if (error) {
            logger.error("openHAB-cloud: Error finding enrollment: " + error);
            req.flash('error', 'There was an error while processing your request');
            res.redirect('/staff');
        } else {
            logger.error("openHAB-cloud: Unable to find enrollment");
            req.flash('error', 'There was an error while processing your request');
            res.redirect('/staff');
        }
    });
}

exports.invitationsget = function(req, res) {
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            if (req.query.hasOwnProperty('email')) {
                var filter = {used: false, email: req.query.email}
            } else {
                var filter = {used: false};
            }
            Invitation.find(filter)
                .limit(perPage)
                .skip(perPage * page)
                .sort({created: 'asc'})
                .exec(function(error, invitations) {
                    Invitation.count().exec(function (err, count) {
                        res.render('staff/invitations', { invitations: invitations, pages: count / perPage, page: page,
                            title: "Enrollments", user: req.user, openhab: openhab,
                            errormessages:req.flash('error'), infomessages:req.flash('info') });
                    });
                });
        } else {

        }
    });
}

exports.resendinvitation = function(req, res) {
    var invitationId = req.params.id;
    Invitation.findOne({_id: invitationId}, function(error, invitation) {
        if (!error && invitation) {
            invitation.resend(function(error) {
                if (!error) {
                    req.flash('info', 'Invitation was resent!');
                    res.redirect('/staff/invitations');
                } else {
                    req.flash('error', 'There was an error while processing your request');
                    res.redirect('/staff/invitations');
                }
            });
        }
    });
}

exports.deleteinvitation = function(req, res) {
    var invitationId = req.params.id;
    Invitation.findOne({_id: invitationId}, function(error, invitation) {
        if (!error && invitation) {
            invitation.remove(function(error, invite) {
                if (!error) {
                    req.flash('info', 'Invitation was deleted');
                    res.redirect('/staff/invitations');
                } else {
                    req.flash('error', 'There was an error while processing your request');
                    res.redirect('/staff/invitations');
                }
            });
        } else {
            req.flash('error', 'There was an error while processing your request');
            res.redirect('/staff/invitations');
        }
    });
}

exports.oauthclientsget = function(req, res) {
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            OAuth2Client.find()
                .limit(perPage)
                .skip(perPage * page)
                .sort({created: 'asc'})
                .exec(function(error, oauthclients) {
                    OAuth2Client.count().exec(function (err, count) {
                        res.render('staff/oauthclients', { oauthclients: oauthclients, pages: count / perPage, page: page,
                            title: "OAuth Clients", user: req.user, openhab: openhab,
                            errormessages:req.flash('error'), infomessages:req.flash('info') });
                    });
                });
        } else {

        }
    });
}

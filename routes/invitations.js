var User = require('../models/user');
var Openhab = require('../models/openhab');
var Invitation = require('../models/invitation');
var form = require('express-form'),
    field = form.field;

exports.invitationsget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        res.render('invitations', { title: "Invitations", user: req.user, openhab: openhab,
            errormessages:req.flash('error'), infomessages:req.flash('info') });
    });
}

exports.invitationspostvalidate = form(
    field("email", "E-Mail").trim().isEmail().required()
);

exports.invitationspost = function(req, res) {
    if (!req.form.isValid) {
        req.user.openhab(function(error, openhab) {
            res.redirect('/invitations');
        });
    } else {
        Invitation.send(req.form.email, function(error, invite) {
            if (!error && invite) {
                req.flash('info', 'Invitation sent!');
                res.redirect('/invitations');
            } else {
                req.flash('error', 'There was an error while processing your request');
                res.redirect('/invitations');
            }
        });
    }
}

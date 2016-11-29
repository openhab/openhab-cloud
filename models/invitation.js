var mongoose = require('mongoose')
    ,Schema = mongoose.Schema
    ,ObjectId = mongoose.SchemaTypes.ObjectId
    ,logger = require('../logger.js')
    ,uuid = require('uuid')
    ,mailer = require('../mailer');

var InvitationSchema = new Schema({
    code: String,
    email: String,
    used: {type: Boolean, default: false},
    lastNotified: {type: Date},
    created: { type: Date, default: Date.now },
    activated: { type: Date }
});

// This is a static method to create and send a new invitation in one shot!

InvitationSchema.static('send', function(email, cb) {
    var invite = new this();
    invite.code = uuid.v1();
    invite.email = email;
    invite.save(function(err, invitation) {
        if (err) {
            logger.error('Error: ' + err);
            cb(err, null);
        } else {
            var locals = {
                email: invite.email,
                invitationCode: invite.code
            };
            mailer.sendEmail(invite.email, 'My openHAB invitation', 'invitation-email', locals, function(error) {
                if (error) {
                    cb(error, null);
                } else {
                    cb(null, invite);
                }
            });
        }
    });

});

InvitationSchema.method('resend', function (cb) {
    var locals = {
        email: this.email,
        invitationCode: this.code
    };
    mailer.sendEmail(this.email, 'My openHAB invitation', 'invitation-email', locals, function(error) {
        if (error) {
            cb(error);
        } else {
            cb(null);
        }
    });
});

module.exports = mongoose.model('Invitation', InvitationSchema);

var mongoose = require('mongoose')
    ,Schema = mongoose.Schema
    ,ObjectId = mongoose.SchemaTypes.ObjectId
    ,logger = require('../logger.js')
    ,uuid = require('uuid')
    ,mailer = require('../mailer');

var EmailVerificationSchema = new Schema({
    code: String,
    email: String,
    user: {type: ObjectId, ref: 'User'},
    used: {type: Boolean, default: false},
    created: { type: Date, default: Date.now }
});

// This is a static method to create and send a new invitation in one shot!

EmailVerificationSchema.static('send', function(user, cb) {
    var emailVerification = new this;
    emailVerification.code = uuid.v1();
    emailVerification.user = user.id;
    emailVerification.email = user.username;
    emailVerification.save(function(err, emailVerificationSaved) {
        if (err) {
            logger.error('Error: ' + err);
            cb(err, null);
        } else {
            var locals = {
                email: emailVerificationSaved.email,
                code: emailVerificationSaved.code
            };
            mailer.sendEmail(emailVerificationSaved.email, 'My openHAB account activation', 'activation-email', locals, function(error) {
                if (error) {
                    logger.error('Error: ' + error);
                    cb(error, null);
                } else {
                    cb(null, emailVerificationSaved);
                }
            });
        }
    });
});

EmailVerificationSchema.method('resend', function (cb) {
    var locals = {
        email: this.email,
        code: this.code
    };
    mailer.sendEmail(this.email, 'My openHAB account activation', 'activation-email', locals, function(error) {
        if (error) {
            logger.error('Error: ' + error);
            cb(error);
        } else {
            cb(null);
        }
    });
});

module.exports = mongoose.model('EmailVerification', EmailVerificationSchema);

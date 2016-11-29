// This is an utility class to send e-mails to a user on behalf of openhab-cloud
var path           = require('path')
    , templatesDir   = path.resolve(__dirname, '.', 'templates')
    , emailTemplates = require('email-templates')
    , nodemailer     = require('nodemailer');
var logger = require('./logger.js');
var User = require('./models/user');
var app = require('./app');

var productionEnv = process.env.NODE_ENV || 'dev';

if (productionEnv == 'production') {
    module.exports.sendEmail = function(email, subject, templateName, locals, cb) {
        emailTemplates(templatesDir, function(err, template) {
            if (err) {
                cb(err);
            } else {
                var transport = nodemailer.createTransport("SMTP", {
                    host: app.config.mailer.host,
                    port: app.config.mailer.port,
                    secureConnection: app.config.mailer.secureConnection,
                    auth: {
                        user: app.config.mailer.user,
                        pass: app.config.mailer.password
                    }
                });
                template(templateName, locals, function(err, html, text) {
                    if (err) {
                        cb(err);
                    } else {
                        transport.sendMail( {
                            from: app.config.mailer.from,
                            to: email,
                            subject: subject,
                            html: html,
                            generateTextFromHTML: true
                        }, function(err, responseStatus) {
                            if (err) {
                                cb(err)
                            } else {
                                cb (null);
                            }
                        });
                    }
                });
            }
        });
    }
} else {
    logger.info("openHAB-cloud: Mailer will emulate sending in development environment");
    module.exports.sendEmail = function(email, subject, templateName, locals, cb) {
        logger.info("openHAB-cloud: Emulating sendEmail to " + email + " about " + subject);
        cb(null);
    }
}


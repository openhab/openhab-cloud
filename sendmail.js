// This is an utility to send e-mails to a single user or all users on behalf of openhab-cloud
var path           = require('path')
    , templatesDir   = path.resolve(__dirname, '.', 'templates')
    , emailTemplates = require('email-templates')
    , nodemailer     = require('nodemailer');
var logger = require('./logger.js');
var User = require('./models/user');
var mongoose = require('mongoose')
    , logger = require('./logger.js');
var config = require('./config.json');


mongoose.connect('mongodb://' + config.mongodb.user + ':' + config.mongodb.password + '@' + config.mongodb.hosts[0] + '/openhab', function(err) {
    if (err) {
        logger.error("openHAB-cloud: mongo connection error: " + err);
    } else {
        logger.info("openHAB-cloud: connected to mongodb");
    }
});


var template = process.argv[2];
var userMail = process.argv[3];

function sendEmail(email, templateName, cb) {
    emailTemplates(templatesDir, function(err, template) {
        if (err) {
            cb(err);
        } else {
            var transport = nodemailer.createTransport("SMTP", {
                host: config.mailer.host,
                port: config.mailer.port,
                secureConnection: true,
                auth: {
                    user: config.mailer.user,
                    pass: config.mailer.pass
                }
            });
            var locals = {
                email: email
            };
            template(templateName, locals, function(err, html, text) {
                if (err) {
                    cb(err);
                } else {
                    transport.sendMail( {
                        from: 'My openHAB <my@openhab.org>',
                        to: locals.email,
                        subject: 'My openHAB news',
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

if (template) {
    if (userMail) {
        sendEmail(userMail, template, function(error) {
            if (!error) {
                console.log("openHAB-cloud: Mail sent!")
                process.exit(0);
            } else {
                console.log("openHAB-cloud: Error sending mail: " + error);
                process.exit(0);
            }
        });
    } else {
        User.find({}, function(error, users) {
            console.log("openHAB-cloud: Sending mail to " + users.length + " users");
            if (!error && users) {
                for (var i=0; i<users.length; i++) {
                    var user = users[i];
                    console.log("openHAB-cloud: Sending mail to " + user.username);
                    sendEmail(user.username, template, function(error) {
                        if (error) {
                            console.log("openHAB-cloud: Error sending mail: " + error);
                        } else {
                            console.log("openHAB-cloud: Mail sent!");
                        }
                    });
                }
                console.log("openHAB-cloud: All mails sent!");
            } else {
                if (error) {
                    console.log("openHAB-cloud: Error selecting users: " + error);
                    process.exit(0);
                } else {
                    console.log("openHAB-cloud: Unable to find any users");
                    process.exit(0);
                }
            }
        });
    }
} else {
    console.log("openHAB-cloud: Usage: node sendmail.js <template name> [<user email>]")
    console.log("openHAB-cloud: WARNING! If user email is not specified, e-mail will be sent to all openhab-cloud users!");
}

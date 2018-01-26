//This is an utility class to send e-mails to a user on behalf of openhab-cloud
var path = require('path'),
templatesDir   = path.resolve(__dirname, '.', 'templates'),
nodemailer     = require('nodemailer'),
logger = require('./logger.js'),
app = require('./app'),
productionEnv = process.env.NODE_ENV || 'dev';

const Email = require('email-templates');

if (productionEnv === 'production') {
	module.exports.sendEmail = function(email, subject, templateName, locals,
			cb) {
		try {
			var smtpConfig = {
					host : app.config.mailer.host,
					port : app.config.mailer.port,
					secure : app.config.mailer.secureConnection, // use SSL
					tls : {
						rejectUnauthorized : false
					},
					auth : {
						user : app.config.mailer.user,
						pass : app.config.mailer.password
					}
			};
			var transport = nodemailer.createTransport(smtpConfig);
		} catch (error) {
			logger
			.error('openHAB-cloud: sendMail error occured during SMTP transport: '
					+ error);
		}
		try {
			var message = {
					from : app.config.mailer.from,
					to : email,
					subject : subject,
					generateTextFromHTML : true
			};
			emailsender = new Email({
				views : {
					root : templatesDir,
					options : {
						extension : 'ejs'
					}
				},
				transport : transport
			});

			emailsender.send({
				template : templateName,
				message : message,
				locals : locals
			});
			cb(null);
		} catch (error) {
			logger
			.error('openHAB-cloud: sendMail error occured during sending: '
					+ error);
		}
	}
} else {
	logger
	.info('openHAB-cloud: Mailer will emulate sending in development environment');
	module.exports.sendEmail = function(email, subject, templateName, locals,
			cb) {
		logger.info('openHAB-cloud: Emulating sendEmail to ' + email
				+ ' about ' + subject);
		cb(null);
	}
}

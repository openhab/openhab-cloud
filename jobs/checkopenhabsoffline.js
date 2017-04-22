var cronJob = require('cron').CronJob,
    logger = require('../logger'),
    mailer = require('../mailer'),
    // Mongoose models
    User = require('../models/user'),
    Openhab = require('../models/openhab'),
    UserAccount = require('../models/useraccount');

// This job checks for openhabs which has been offline for more then 3 days and sends warning emails to their
// owners, pointing out that we didn't see their openhabs for quite long time, not more then one email per 3 days
module.exports = new cronJob('00 00 00 * * *', function () {
    logger.info('openHAB-cloud: checkopenhabsoffline job started');
    date3DaysAgo = new Date;
    date3DaysAgo.setDate(date3DaysAgo.getDate()-3);
    logger.info('openHAB-cloud: date3DaysAgo = ' + date3DaysAgo);
    Openhab.find({status:'offline', last_online: {'$lt':date3DaysAgo}}, function (error, openhabs) {
        if (error) {
            logger.error('openHAB-cloud: Error finding offline openHABs: ' + error);
        }

        if (!openhabs) {
            logger.info('openHAB-cloud: No offline openHABs found');
        }
        logger.info('openHAB-cloud: Found ' + openhabs.length + ' openhabs');
        for (var i in openhabs) {
            var openhab = openhabs[i];

            if (openhab.last_email_notification && openhab.last_email_notification > date3DaysAgo) {
                continue;
            }

            openhab.last_email_notification = new Date;
            openhab.save();

            UserAccount.findOne({_id:openhab.account}, function (error, userAccount) {
                if (error) {
                    logger.error('openHAB-cloud: Error finding user account for openhab: ' + error);
                }

                if (!userAccount) {
                    logger.error('openHAB-cloud: Unable to find user account for openhab which is nonsense');
                }

                User.find({account: userAccount.id, role:'master'}, function (error, users) {
                    if (error || !users) {
                        return;
                    }

                    for (var i in users) {
                        var user = users[i];
                        var locals = {
                            email: user.username
                        };
                        mailer.sendEmail(user.username, 'We are worried about your openHAB',
                            'openhaboffline', locals, function (error) {
                                if (error) {
                                    logger.error('openHAB-cloud: Error sending email: ' + error);
                                }
                            });
                    }
                });
            });
        }
    });
    logger.info('openHAB-cloud: checkopenhabsoffline job finished');
});

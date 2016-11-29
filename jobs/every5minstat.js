var cronJob = require('cron').CronJob
    , logger = require('../logger')
    , redis = require('../redis-helper');
// Mongoose models
var User = require('../models/user');
var Openhab = require('../models/openhab');
var OpenhabConfig = require('../models/openhabconfig');
var Event = require('../models/event');
var Item = require('../models/item');
var UserDevice = require('../models/userdevice');
var UserAccount = require('../models/useraccount');
var Notification = require('../models/notification');
var AccessLog = require('../models/accesslog');
var OpenhabAccessLog = require('../models/openhabaccesslog');
var Invitation = require('../models/invitation');
var Myohstat = require('../models/myohstat');

module.exports = new cronJob('00 */5 * * * *', function() {
    logger.info("openHAB-cloud: every5min statistics collection job started");
    Openhab.count({}, function(err, openhabCount) {
        if (!err) {
            Openhab.count({status: 'online'}, function(err, openhabOnlineCount) {
                if (!err) {
                    User.count({}, function(err, userCount) {
                        if (!err) {
                            Invitation.count({used:true}, function(err, invitationUsedCount) {
                                if (!err) {
                                    Invitation.count({used:false}, function(err, invitationUnusedCount) {
                                        if (!err) {
                                            UserDevice.count({}, function(err, userDeviceCount) {
                                                if (!err) {
                                                    var newStat = new Myohstat({uC: userCount, oC: openhabCount,
                                                        ooC: openhabOnlineCount, iuC: invitationUsedCount,
                                                        iuuC: invitationUnusedCount, udC: userDeviceCount});
                                                    newStat.save();
                                                    // Set current statistics to redis
                                                    redis.mset(["openhabCount", openhabCount, "openhabOnlineCount", openhabOnlineCount,
                                                        "userCount", userCount, "invitationUsedCount", invitationUsedCount,
                                                        "invitationUnusedCount", invitationUnusedCount,
                                                        "userDeviceCount", userDeviceCount, "last5MinStatTimestamp", new Date()], function(err, result) {
                                                        logger.info("openHAB-cloud: every5min statistics collection job finished");
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});

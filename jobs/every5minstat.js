var cronJob = require('cron').CronJob,
    logger = require('../logger'),
    redis = require('../redis-helper'),
    // Mongoose models
    User = require('../models/user'),
    Openhab = require('../models/openhab'),
    UserDevice = require('../models/userdevice'),
    Invitation = require('../models/invitation'),
    Myohstat = require('../models/myohstat'),
    stats = [],
    openhabCount, userCount, openhabOnlineCount, invitationUsedCount,
    invitationUnusedCount, userDeviceCount;

/**
 * Callback function for a count operation on a Mongoose model. It will save the count in the
 * stats object, if there was no error, and calls the saveStats function to save the
 * statistics, if all counts are finished.
 *
 * Tis function expects, that the this argument is the name of the statistic value.
 *
 * @private
 */
function countCallback (err, count) {
    if (!err) {
        stats[this] = count;
    }
}

/**
 * Checks, if all callbacks are executed and if so, validates the stats object. It will then, if the
 * validation succeeds, save the values to redis.
 */
function saveStats() {
    var newStat;

    // validate the results
    if (Object.keys(stats).length !== 6) {
        // not all data could be retrieved
        logger.info('The length of the stats object does not match the expected one, can not save statistical data.');
        return;
    }

    newStat = new Myohstat({
        uC: stats['userCount'],
        oC: stats['openhabCount'],
        ooC: stats['openhabOnlineCount'],
        iuC: stats['invitationUsedCount'],
        iuuC: stats['invitationUnusedCount'],
        udC: stats['userDeviceCount']
    });
    newStat.save();

    // Set current statistics to redis
    redis.mset(
        [
            'openhabCount',
            stats['openhabCount'],
            'openhabOnlineCount',
            stats['openhabOnlineCount'],
            'userCount',
            stats['userCount'],
            'invitationUsedCount',
            stats['invitationUsedCount'],
            'invitationUnusedCount',
            stats['invitationUnusedCount'],
            'userDeviceCount',
            stats['userDeviceCount'],
            'last5MinStatTimestamp',
            new Date()
        ],
        function (err, result) {
            logger.info('openHAB-cloud: every5min statistics collection job finished');
        }
    );
}

module.exports = new cronJob('00 */5 * * * *', function () {
    var promises = [];

    logger.info('openHAB-cloud: every5min statistics collection job started');

    promises.push(Openhab.count({}, countCallback.bind('openhabCount')).exec());
    promises.push(Openhab.count({status: 'online'}, countCallback.bind('openhabOnlineCount')).exec());
    promises.push(User.count({}, countCallback.bind('userCount')).exec());
    promises.push(Invitation.count({used:true}, countCallback.bind('invitationUsedCount')).exec());
    promises.push(Invitation.count({used:false}, countCallback.bind('invitationUnusedCount')).exec());
    promises.push(UserDevice.count({}, countCallback.bind('userDeviceCount')).exec());

    Promise.all(promises).then(saveStats);
});

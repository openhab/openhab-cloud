var cronJob = require('cron').CronJob,
    logger = require('../logger'),
    redis = require('../redis-helper'),
    // Mongoose models
    User = require('../models/user'),
    Openhab = require('../models/openhab'),
    UserDevice = require('../models/userdevice'),
    Invitation = require('../models/invitation'),
    stats = [];

/**
 * Callback function for a count operation on a Mongoose model. It will save the count in the
 * stats object, if there was no error, and calls the saveStats function to save the
 * statistics, if all counts are finished.
 *
 * Tis function expects, that the this argument is the name of the statistic value.
 *
 * @private
 */
function countCallback(err, count) {
    if (!err) {
        stats[this] = count;
    }
}

/**
 * Checks, if all callbacks are executed and if so, validates the stats object. It will then, if the
 * validation succeeds, save the values to redis.
 */
function saveStats() {
    // validate the results
    if (Object.keys(stats).length !== 6) {
        // not all data could be retrieved
        logger.info('The length of the stats object does not match the expected one, can not save statistical data. %s', stats);
        return;
    }
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
            logger.info('every5min statistics collection job finished');
        }
    );
}

module.exports = new cronJob('00 */5 * * * *', function () {
    var promises = [];
    logger.info('every5min statistics collection job started');
    //obtain a lock to update, we don't bother removing as it has a short expire, this is just to avoid unnecessary updates from multiple servers. 
    redis.set("jobs:every5minstat", "", 'NX', 'EX', 10, (error, result) => {
        if (result) {
            logger.info('every5min statistics collection job obtained lock');
            // OpenHAB instances (total)
            promises.push(
                Openhab.countDocuments({})
                    .then(count => countCallback.call('openhabCount', null, count))
            );
            promises.push(new Promise(resolve => {
                redis.eval("return #redis.pcall('keys', 'connection:*')", 0, (err, res) => {
                    const f = countCallback.bind('openhabOnlineCount');
                    f(err, res);
                    resolve(res);
                });
            }));
            // Users (total)
            promises.push(
                User.countDocuments({})
                    .then(count => countCallback.call('userCount', null, count))
            );
            // Invitations (used)
            promises.push(
                Invitation.countDocuments({ used: true })
                    .then(count => countCallback.call('invitationUsedCount', null, count))
            );
            // Invitations (unused)
            promises.push(
                Invitation.countDocuments({ used: false })
                    .then(count => countCallback.call('invitationUnusedCount', null, count))
            );
            // User devices (total)
            promises.push(
                UserDevice.countDocuments({})
                    .then(count => countCallback.call('userDeviceCount', null, count))
            );

            Promise.all(promises).then(saveStats);
        }
    });
});

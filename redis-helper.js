// This module handles shared redis client for all

var app = require('./app.js'),
    logger = require('./logger.js'),
    redis = require('redis'),
    redisClient;

logger.info('openHAB-cloud: Connecting to Redis at ' + app.system.getRedisHost() + ':' + app.system.getRedisPort());

redisClient = redis.createClient(app.system.getRedisPort(), app.system.getRedisHost());
try {
    // getRedisPassword will thrown error if password is not defined b/c auth is not required.
    redisClient.auth(app.system.getRedisPassword(), function(error, data) {
        if (error) {
            logger.error(error);
        } else {
            logger.info('openHAB-cloud: Redis connect response: ' + data);
        }
    });
} catch (ignored) {
}

redisClient.on('ready', function () {
    logger.info('openHAB-cloud: Redis is ready');
});

redisClient.on('end', function () {
    logger.error('openHAB-cloud: Redis error: connection is closed');
});

redisClient.on('error', function (error) {
    logger.error('openHAB-cloud: Redis error: ' + error);
});

module.exports = redisClient;

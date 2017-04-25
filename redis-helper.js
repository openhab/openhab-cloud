// This module handles shared redis client for all

var app = require('./app.js'),
    logger = require('./logger.js'),
    redis = require('redis'),
    redisClient;

logger.info('openHAB-cloud: Connecting ro Redis at ' + app.config.redis.host + ':' + app.config.redis.port);

redisClient = redis.createClient(app.config.redis.port, app.config.redis.host);
redisClient.auth(app.config.redis.password, function(error, data) {
    if (error) {
        logger.error(error);
    } else {
        logger.info('openHAB-cloud: Redis connect response: ' + data);
    }
});

redisClient.on('ready', function () {
    logger.info('Redis is ready');
});

redisClient.on('end', function () {
    logger.error('openHAB-cloud: Redis error: connection is closed');
});

redisClient.on('error', function (error) {
    logger.error('openHAB-cloud: Redis error: ' + error);
});

module.exports = redisClient;

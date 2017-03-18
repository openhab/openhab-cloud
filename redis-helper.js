// This module handles shared redis client for all

var logger = require("./logger.js");
var redis = require("redis");

module.exports = function (config) {
    logger.info("openHAB-cloud: Connecting ro Redis at " + config.host + ":" + config.port);
    var redisClient = redis.createClient(config.port, config.host); //, {auth_pass: config.password});
    redisClient.auth(config.password, function (error, data) {
        if (error) {
            logger.error(error);
        } else {
            logger.info("openHAB-cloud: Redis connect response: " + data);
        }
    });
    redisClient.on("ready", function () {
        logger.info("Redis is ready");
    });
    redisClient.on("end", function () {
        logger.error("openHAB-cloud: Redis error: connection is closed");
    });
    redisClient.on("error", function (error) {
        logger.error("openHAB-cloud: Redis error: " + error);
    });
    
    return redisClient;
};

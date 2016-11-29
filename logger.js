/*
    This module maintains logger for openhab-cloud application and it's components
    Logging is sent to console (with timestamp) and openhab Loggly (without timestamp)
    as plain text.
 */

var winston = require('winston');

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({json: false, timestamp: true, level: "debug"})
    ],
    exceptionHandlers : [
        new (winston.transports.Console)({json: false, timestamp: true, level: "debug"})
    ],
    exitOnError : false
});

module.exports = logger;

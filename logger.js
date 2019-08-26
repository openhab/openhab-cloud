/*
    This module maintains logger for openhab-cloud application and it's components
    Logging is sent to console (with timestamp) and openhab Loggly (without timestamp)
    as plain text.
 */

var winston = require('winston'), logger;
require('winston-daily-rotate-file');
var system = require('./system');

system.setConfiguration(require('./config.json'))

//default NPM levels with the addition of 'audit" for audit logs
var levels = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5,
    audit: 6
};

var timeFormat = winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss:sss'
});

var logFormat = winston.format.printf(function (info) {
    return `${info.timestamp} ${info.level}: ${info.message}`
})

var fileLog = new (winston.transports.DailyRotateFile)({
    filename: system.getLoggerDir() + 'openhab-cloud-%DATE%-process-' + system.getNodeProcessPort() + '.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxFiles: system.getLoggerMaxFiles(),
    handleExceptions: true,
    level: system.getLoggerLevel(),
    format: winston.format.combine(
        timeFormat,
        winston.format.splat(),
        logFormat
    )
});

var auditFilter = winston.format(function (info, opts) {
    if (info.level === 'audit') { return info; }
    return false;
});

var auditLog = new (winston.transports.DailyRotateFile)({
    filename: system.getLoggerDir() + 'audit-%DATE%-process-' + system.getNodeProcessPort() + '.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxFiles: system.getLoggerMaxFiles(),
    level: 'audit',
    format: winston.format.combine(
        auditFilter(),
        timeFormat,
        winston.format.splat(),
        logFormat
    )
});

var consoleLog = new (winston.transports.Console)({
    handleExceptions: true,
    level: system.getLoggerLevel(),
    format: winston.format.combine(
        timeFormat,
        winston.format.splat(),
        logFormat
    )
})

if(system.getLoggerType() == 'console') {
    var defaultLog = consoleLog
} else {
    var defaultLog = fileLog
}

logger = winston.createLogger({
    transports: [
        defaultLog,
        auditLog
    ],
    exitOnError: false,
    levels: levels
});

logger.auditRequest = function (req) {
    var headers = req.headers;

    // Strip off path prefix for remote vhosts hack
    var requestPath = req.path;
    if (requestPath.indexOf('/remote/') === 0) {
        requestPath = requestPath.replace('/remote', '');
    }

    this.audit("%s | %s | %s | %s | %s | %s | %s", req.user.username, req.openhab.status, req.method, requestPath, headers[`x-real-ip`], headers['host'], headers['user-agent'])
}

module.exports = logger;

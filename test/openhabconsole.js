var io = require('socket.io-client');
var mongoose = require('mongoose')
    , logger = require('../logger.js');
var Openhab = require('../models/openhab');

if (process.argv.length < 4) {
    logger.error("Usage: openhabconsole.js uuid secret [base url]");
    process.exit();
}

var uuid = process.argv[2];
var secret = process.argv[3];
if (process.argv[4]) {
    var baseUrl = process.argv[4];
} else {
    var baseUrl = "https://openhab-cloud.org/";
}

logger.info("Connecting to openHAB-cloud as " + uuid + '/' + secret + ' at ' + baseUrl);

var sio = io.connect(baseUrl, {query: "uuid=" + uuid +
"&secret=" + secret});

sio.on('connect', function() {
    logger.info("Socket.io connected");
});

sio.on('disconnect', function() {
    logger.info("Socket.io disconnected");
});

sio.on('error', function(error) {
    logger.error("Socket.io error: " + error);
    process.exit();
});

sio.on('notification', function(data) {
    logger.info("Notification: ", data);
});

sio.on('lognotification', function(data) {
    logger.info("Log notification: ", data);
});

sio.on('broadcastnotification', function(data) {
    logger.info("Broadcast notification: ", data);
});

sio.on('itemupdate', function(data) {
    logger.info("Item update: ", data);
});

sio.on('request', function(data) {
    logger.info("Request: ", data);
});

sio.on('responseHeader', function(data) {
    logger.info("Response header: ", data);
});

sio.on('responseFinished', function(data) {
    logger.info("Response finished: ", data);
});

sio.on('command', function(data) {
    logger.info("Command: ", data);
});

var config = require('./config.json'),
    gcm, gcmSender;

/*
 This module maintains GCM sender for openhab-cloud application and it's components
 */

gcm = require('node-gcm');
gcmSender = new gcm.Sender(config.gcm.password);

module.exports = gcmSender;

var config = require("./config.json")
/*
 This module maintains GCM sender for openhab-cloud application and it's components
 */

var gcm = require('node-gcm');
var gcmSender = new gcm.Sender(config.gcm.password);
module.exports = gcmSender;

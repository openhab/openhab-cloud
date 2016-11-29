var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var RequestLogSchema = new Schema({
    id: Number,                 // Request uniq id
    url: String,                // Request url
    openhab: ObjectId,          // openHAB of the request
    requestReceived: Date,      // when request was received from mobile app
    requestSent: Date,          // when request was sent to openHAB
    responseReceived: Date,     // when response to request was received from openHAB
    responseSent: Date,         // when response to request was sent to mobile app
    responseStatus: Number      // Response HTTP response code
});

module.exports = mongoose.model('RequestLog', RequestLogSchema);

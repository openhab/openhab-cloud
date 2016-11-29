var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var AccessLogSchema = new Schema({
    openhab: ObjectId,
    user: ObjectId,
    path: String,
    method: String,
    remoteHost: String,
    whenStarted: { type: Date, default: Date.now },
    whenFinished: Date
});

AccessLogSchema.index({openhab:1, user:1, path:1, whenStarted:1});

module.exports = mongoose.model('AccessLog', AccessLogSchema);

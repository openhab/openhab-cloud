var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OpenhabAccessLogSchema = new Schema({
    openhab: ObjectId,
    remoteHost: String,
    remoteVersion: String,
    remoteClientVersion: String,
    whenStarted: { type: Date, default: Date.now },
    whenFinished: Date
});

OpenhabAccessLogSchema.index({openhab:1, whenStarted:1});

module.exports = mongoose.model('OpenhabAccessLog', OpenhabAccessLogSchema);

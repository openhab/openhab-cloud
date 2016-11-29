var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var UserLocationHistorySchema = new Schema({
    userDevice: ObjectId,
    when: {type: Date, default: Date.now},
    globalLocation: {type: [Number], index: '2d'},
    globalAccuracy: {type: Number},
    globalAltitude: {type: Number},
    indoorLocation: {type: [Number], index: '2d'}
});

// Index for event list reads
UserLocationHistorySchema.index({userDevice: 1, when: 1});

module.exports = mongoose.model('UserLocationHistory', UserLocationHistorySchema);

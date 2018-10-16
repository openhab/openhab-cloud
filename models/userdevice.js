var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    bcrypt = require('bcrypt'),
    Openhab = require('./openhab'),
    Email = mongoose.SchemaTypes.Email,
    ObjectId = mongoose.SchemaTypes.ObjectId;

var UserDeviceSchema = new Schema({
    owner: {type: ObjectId, required: true},
    androidRegistration: {type: String},
    iosDeviceToken: {type: String},
    deviceType: {type: String},
    deviceModel: {type: String},
    deviceId: {type: String},
    globalLocation: {type: [Number], index: '2d'},
    globalAltitude: {type: Number},
    globalAccuracy: {type: Number},
    lastGlobalLocation: {type: Date},
    indoorLocation: {type: [Number], index: '2d'},
    lastIndoorLocation: {type: Date},
    lastUpdate: { type: Date },
    registered: { type: Date }
});

// Index for lookups by owner, type and uniq id
UserDeviceSchema.index({owner:1, deviceType:1, deviceId:1});
// Index for lookups by android registration
UserDeviceSchema.index({androidRegistration:1});
// Index for lookups by ios device token
UserDeviceSchema.index({iosDeviceToken:1});

module.exports = mongoose.model('UserDevice', UserDeviceSchema);

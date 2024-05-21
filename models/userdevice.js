var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    bcrypt = require('bcrypt'),
    Openhab = require('./openhab'),
    Email = mongoose.SchemaTypes.Email,
    ObjectId = mongoose.SchemaTypes.ObjectId;

var UserDeviceSchema = new Schema({
    owner: {type: ObjectId, required: true},
    androidRegistration: {type: String}, // Deprecated in favor of fcmRegistration
    iosDeviceToken: {type: String}, // will migrate to fcmRegistration in the future
    fcmRegistration : {type: String}, //Firebase Cloud Messaging registration token
    deviceType: {type: String},
    deviceModel: {type: String},
    deviceId: {type: String},
    lastUpdate: { type: Date },
    registered: { type: Date }
});

// Index for lookups by owner, type and uniq id
UserDeviceSchema.index({owner:1, deviceType:1, deviceId:1});
// Index for lookups by android registration
UserDeviceSchema.index({androidRegistration:1});
// Index for lookups by ios device token
UserDeviceSchema.index({iosDeviceToken:1});
// Index for lookups by FCM device token
UserDeviceSchema.index({fcmRegistration:1});

module.exports = mongoose.model('UserDevice', UserDeviceSchema);

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    bcrypt = require('bcrypt'),
    Openhab = require('./openhab'),
    Email = mongoose.SchemaTypes.Email,
    ObjectId = mongoose.SchemaTypes.ObjectId;

var UserAccountSchema = new Schema({
    modified: {type: Date},
    registered: { type: Date }
});

// Index for lookups by owner, type and uniq id
UserAccountSchema.index({owner:1, deviceType:1, deviceId:1});

module.exports = mongoose.model('UserAccount', UserAccountSchema);

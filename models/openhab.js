var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = mongoose.SchemaTypes.ObjectId;

var OpenhabSchema = new Schema({
    name: String,                                       // A meaningfull name of openHAB
    uuid: { type: String, unique: true },                 // openHAB generated UUID
    secret: String,                                     // openHAB generated secret
    account: { type: ObjectId },                          // An account openHAB belongs to
    last_online: { type: Date }                        // last seen this openHAB online
});

// Index for lookups by uuid
OpenhabSchema.index({ uuid: 1 });
// Index for lookups by owner
OpenhabSchema.index({ account: 1 });

OpenhabSchema.methods.authenticate = function (openhabUuid, openhabSecret, callback) {
    this.model('Openhab').findOne({ uuid: openhabUuid, secret: openhabSecret }, function (error, openhab) {
        if (error) {
            callback(error, false);
        } else {
            if (openhab) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        }
    });
}

OpenhabSchema.statics.setLastOnline = function (id, callback) {
    this.model('Openhab').findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id)},
        { $set: { last_online: new Date() } },
        callback);
}

module.exports = mongoose.model('Openhab', OpenhabSchema);

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = mongoose.SchemaTypes.ObjectId,
    OpenhabConfig = require('./openhabconfig')

var OpenhabSchema = new Schema({
    name: String,                                       // A meaningfull name of openHAB
    uuid: {type: String, unique: true},                 // openHAB generated UUID
    secret: String,                                     // openHAB generated secret
    config: Schema.Types.Mixed,                         // openhab.cfg
    owner: {type: ObjectId },                           // obsolate
    account: {type: ObjectId},                          // An account openHAB belongs to
    openhabVersion: String,                             // openHAB version
    clientVersion: String,                              // openhab-cloud bundle version
    global_location: {type: [Number], index: '2d'},     // openHAB's global location
    last_online: { type: Date },                        // last seen this openHAB online
    last_email_notification: {type: Date},              // last notification about openHAB being offline for long time
    status: {type: String, default: "offline"},         // current openHAB status (online/offline)
    serverAddress: {type: String}                       // the host:port that this openhab is connected to
});

// Index for lookups by uuid
OpenhabSchema.index({uuid:1});
// Index for lookups by owner
OpenhabSchema.index({account:1});
// Index for lookups by status
OpenhabSchema.index({status:1, last_online:1});

OpenhabSchema.methods.authenticate = function(openhabUuid, openhabSecret, callback) {
    this.model('Openhab').findOne({uuid: openhabUuid, secret: openhabSecret}, function(error, openhab) {
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

module.exports = mongoose.model('Openhab', OpenhabSchema);

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var ItemSchema = new Schema({
    openhab: ObjectId,              // openHAB this item belongs to
    name: String,                   // Item name
    type: String,                   // Item type (Group, Switch, Number, etc)
    label: String,                  // Item label ("Dinner lights")
    groups: [ObjectId],             // An array of ObjectIds of Group typed Items this Item belongs to
    icon: String,                   // icon name for this Item
    status: String,                 // Current Item status
    prev_status: String,            // Previous status value
    last_update: Date,              // Date/time of last Item status update
    last_change: Date,              // Date/time of last Item change
    states: [Schema.Types.Mixed]    // We cache last X (50?) states of the item in this array
                                    // in a form of {when: Date, value: String}, latest values first in array
}, {
    versionKey: false,
    safe: { w: 0, j: false, wtimeout: 10000 },
    validateBeforeSave: false,
    strict: false
});

ItemSchema.index({openhab:1, name:1}, { unique: true });

module.exports = mongoose.model('Item', ItemSchema);

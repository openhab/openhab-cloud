var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

const goodColor = "#e0f0d5";
const badColor = "#f1dede";
const infoColor = "#daedf8";

var EventSchema = new Schema({
    openhab: ObjectId,
    source: String,
    oldStatus: String,
    status: String,
    numericStatus: Number,
    oldNumericStatus: Number,
    color: String,
    when: {type: Date, default: Date.now, expires: '14d'}
}, {
    versionKey: false,
    safe: { w: 0, j: false, wtimeout: 10000 },
    validateBeforeSave: false,
    strict: false
});

// Index for event list reads
EventSchema.index({openhab: 1});
EventSchema.index({openhab: 1, when: 1});
EventSchema.index({openhab: 1, source: 1});
EventSchema.index({openhab: 1, source: 1, status:1});
EventSchema.index({openhab: 1, source: 1, numericStatus: 1, oldNumericStatus: 1});

// Returns #xxxxxx color code based on event color
EventSchema.virtual('colorHex').get(function () {
    if (this.color == 'good')
        return goodColor;
    else if (this.color == 'bad')
        return badColor;
    else if (this.color == 'info')
        return infoColor;
});

module.exports = mongoose.model('Event', EventSchema);

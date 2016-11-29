var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OpenhabConfigSchema = new Schema({
    openhab: ObjectId,
    type: String,
    name: String,
    timestamp: Date,
    config: Schema.Types.Mixed
});

module.exports = mongoose.model('OpenhabConfig', OpenhabConfigSchema);

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;


var LostPasswordSchema = new Schema({
    user: ObjectId,
    recoveryCode: String,
    used: { type: Boolean, default: false },
    created: { type: Date, default: Date.now, expires: '30d' }
});

LostPasswordSchema.index({user:1, created:1});

module.exports = mongoose.model('LostPassword', LostPasswordSchema);

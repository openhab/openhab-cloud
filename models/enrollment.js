var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var EnrollmentSchema = new Schema({
    email: String,
    platform: String,
    javaExp: String,
    description: String,
    created: { type: Date, default: Date.now },
    invited: { type: Date }
});

module.exports = mongoose.model('Enrollment', EnrollmentSchema);

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OAuth2ScopeSchema = new Schema({
    name: String,                               // name of the scope
    description: String,                        // description of what does this scope permits to do for user
    valid: { type: Boolean, default: true},     // Is this scope is active?
    created: { type: Date, default: Date.now }  // When scope was created
});

OAuth2ScopeSchema.index({name: 1}, { unique: true }); // to find token by token and client

module.exports = mongoose.model('OAuth2Scope', OAuth2ScopeSchema);

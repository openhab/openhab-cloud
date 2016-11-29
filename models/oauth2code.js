var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OAuth2CodeSchema = new Schema({
    user: ObjectId,                             // openhab-cloud user this code belongs to
    oAuthClient: ObjectId,                      // openhab-cloud OAuth2 Client this code was created for
    code: String,                               // code itself
    scope: [String],                            // code scope (what can be done with this code?)
    redirectURI: String,                        // redirect URI
    valid: { type: Boolean, default: true},     // Is this code is active?
    created: { type: Date, default: Date.now }  // When code was created
});

OAuth2CodeSchema.index({code: 1, oAuthClient:1}, { unique: false }); // to find code by code and client
OAuth2CodeSchema.index({code: 1, oAuthClient:1, redirectURI:1}, { unique: false }); // to find token by token, client and URI
OAuth2CodeSchema.index({user: 1}, { unique: false }); // to find token by user

module.exports = mongoose.model('OAuth2Code', OAuth2CodeSchema);

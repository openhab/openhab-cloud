var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OAuth2TokenSchema = new Schema({
    user: ObjectId,                             // openhab-cloud user this token belongs to
    oAuthClient: {type: ObjectId, ref: 'OAuth2Client'}, // openhab-cloud OAuth2 Client this token was created for
    token: String,                              // token
    scope: [String],                            // token scope (what can be done with this token?)
    valid: { type: Boolean, default: true},     // Is this token is active?
    created: { type: Date, default: Date.now }  // When token was created
});

OAuth2TokenSchema.index({token: 1, oAuthClient:1}, { unique: false }); // to find token by token and client
OAuth2TokenSchema.index({user: 1}, { unique: false }); // to find token by user

module.exports = mongoose.model('OAuth2Token', OAuth2TokenSchema);

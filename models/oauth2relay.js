var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;

var OAuth2RelaySchema = new Schema({
    name: String,                               // Client name
    description: String,
    homeUrl: String,
    icon: String,
    clientId: String,                           // Client oauth2 id
    clientSecret: String,                       // Client oauth2 secret
    targetAuthorizeUrl: String,
    targetTokenUrl: String,
    active: { type: Boolean, default: true},    // If this client is active?
    created: { type: Date, default: Date.now }, // When client was created
    last_change: Date                           // Date/time of last client change
});

OAuth2RelaySchema.index({clientId:1}, { unique: true }); // to find client by client id

module.exports = mongoose.model('OAuth2Relay', OAuth2RelaySchema);

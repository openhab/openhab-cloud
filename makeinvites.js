var config = require('./config.json');

// MongoDB connection
var mongoose = require('mongoose');
var uuid = require('uuid');
mongoose.connect('mongodb://' + config.mongodb.user + ':' + config.mongodb.password + '@' + config.mongodb.hosts[0] + '/openhab');
var mongooseTypes = require("mongoose-types");
mongooseTypes.loadTypes(mongoose);

// Mongoose models
var User = require('./models/user');
var Openhab = require('./models/openhab');
var Event = require('./models/event');
var Invitation = require('./models/invitation');

console.log("Making 10 invitations!");
for (i=0; i<10; i++) {
    invitationCode = uuid.v1();
    invite = new Invitation({code: invitationCode, email: "openhab@openhab.org"});
    console.log("openHAB-cloud: New invitation code " + invitationCode);
    invite.save(function(err, invitation) {
        console.log("callback");
        if (err) {
            console.log("Error");
        } else {
            console.log("Saved: " + invitation);
        }
    });
}

//mongoose.disconnect();
console.log("Complete!");
//process.exit();

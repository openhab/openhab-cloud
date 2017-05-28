var config = require('./config.json'),
    mongoose = require('mongoose'),
    uuid = require('uuid'),
    mongooseTypes = require('mongoose-types'),
    Invitation = require('./models/invitation'),
    system = require('./system'),
    MongoConnect = require('./system/mongoconnect'),
    mongoConnect;

system.setConfiguration(config);
mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);
mongooseTypes.loadTypes(mongoose);

console.log('Making 10 invitations!');
for (i=0; i<10; i++) {
    var invitationCode,
        invite;

    invitationCode = uuid.v1();
    invite = new Invitation({code: invitationCode, email: 'openhab@openhab.org'});
    console.log('openHAB-cloud: New invitation code ' + invitationCode);
    invite.save(function (err, invitation) {
        console.log('callback');
        if (err) {
            console.log('Error');
        } else {
            console.log('Saved: ' + invitation);
        }
    });
}

console.log('Complete!');

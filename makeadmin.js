// This is a small CLI utility to make a user member of staff

var mongoose = require('mongoose'),
    logger = require('./logger.js'),
    config = require('./config.json'),
    User = require('./models/user'),
    system = require('./system'),
    MongoConnect = require('./system/mongoconnect'),
    mongoConnect;

system.setConfiguration(config);
mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);

username = process.argv[2];

if (!username) {
    console.log('openHAB-cloud: Usage: node makeadmin.js <username>');
    process.exit(0);
}

User.findOne({username: username}, function(error, user) {
    if (!error && user) {
        console.log('openHAB-cloud: Found ' + username + 'user, making him staff');
        user.group = 'staff';
        user.save(function(error) {
            process.exit(0);
        });
    } else if (!user) {
        console.log('openHAB-cloud: User ' + username + ' not found!');
        process.exit(0);
    } else {
        console.log('openHAB-cloud: Error: ' + error);
        process.exit(0);
    }
});

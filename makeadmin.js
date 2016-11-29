// This is a small CLI utility to make a user member of staff

var mongoose = require('mongoose')
    , logger = require('./logger.js');
var config = require('./config.json');

mongoose.connect('mongodb://' + config.mongodb.user + ':' + config.mongodb.password + '@' + config.mongodb.hosts[0] + '/openhab', function(err) {
    if (err) {
        logger.error("openHAB-cloud: mongo connection error: " + err);
    } else {
        logger.info("openHAB-cloud: connected to mongodb");
    }
});

var User = require('./models/user');

username = process.argv[2];

if (username) {
    User.findOne({username: username}, function(error, user) {
        if (!error && user) {
            console.log("openHAB-cloud: Found " + username + "user, making him staff");
            user.group = 'staff';
            user.save(function(error) {
                process.exit(0);
            });
        } else if (!user) {
            console.log("openHAB-cloud: User " + username + " not found!");
            process.exit(0);
        } else {
            console.log("openHAB-cloud: Error: " + error);
            process.exit(0);
        }
    });
} else {
    console.log("openHAB-cloud: Usage: node makeadmin.js <username>")
    process.exit(0);
}

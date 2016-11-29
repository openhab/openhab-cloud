var mongoose = require('mongoose')
    , logger = require('./logger.js');
var User = require('./models/user');
var config = require('./config.json');

mongoose.connect('mongodb://' + config.mongodb.user + ':' + config.mongodb.password + '@' + config.mongodb.hosts[0] + '/openhab', function(err) {
    if (err) {
        logger.error("openHAB-cloud: mongo connection error: " + err);
    } else {
        logger.info("openHAB-cloud: connected to mongodb");
        User.find({role:'master'}, function(error, users) {
            for (var i=0; i<users.length; i++) {
                console.log(users[i].username);
            }
            process.exit(code=0);
        });
    }
});

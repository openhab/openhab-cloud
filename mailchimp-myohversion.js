var mongoose = require('mongoose'),
    logger = require('./logger.js'),
    User = require('./models/user'),
    config = require('./config.json'),
    Openhab = require('./models/openhab'),
    mongoConnectionString;

mongoConnectionString = 'mongodb://' + config.mongodb.user +
    ':' + config.mongodb.password +
    '@' + config.mongodb.hosts[0] +
    '/openhab';

mongoose.connect(mongoConnectionString, function (err) {
    if (err) {
        logger.error('openHAB-cloud: mongo connection error: ' + err);
        return;
    }

    logger.info('openHAB-cloud: connected to mongodb');
    Openhab.find({$or:[{clientVersion:'1.4.0.1'}, {clientVersion:'1.4.0.2'}]}, function (error, openhabs) {
        User.find({role:'master'}, function(error, users) {
            var usersArray = {};
            for (var j=0; j<users.length; j++) {
                usersArray[users[j].account] = users[j];
            }

            for (var i=0; i<openhabs.length; i++) {
                if (usersArray[openhabs[i].account] !== null) {
                    console.log(usersArray[openhabs[i].account].username);
                }
            }
            process.exit(code=0);
        });
    });
});

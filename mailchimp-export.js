var mongoose = require('mongoose'),
    logger = require('./logger.js'),
    User = require('./models/user'),
    config = require('./config.json'),
    system = require('./system'),
    MongoConnect = require('./system/mongoconnect'),
    mongoConnect;

system.setConfiguration(config);
mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);

mongoose.connect(mongoConnectionString, function (err) {
    if (err) {
        logger.error('mongo connection error: ' + err);
        return;
    }
    logger.info('connected to mongodb');
    User.find({role:'master'}, function (error, users) {
        for (var i=0; i<users.length; i++) {
            console.log(users[i].username);
        }
        process.exit(code=0);
    });
});

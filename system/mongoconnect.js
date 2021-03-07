var logger = require('../logger.js');

/**
 * @param {System} system
 * @constructor
 */
function MongoConnect(system) {
    this.system = system;
}

/**
 * Takes the mongoose object and tries to connect it with the configured database of the system object provided to the
 * constructor of this object.
 *
 * The optional callback parameter can be used to pass a callback to the mongoose.connect function.
 *
 * @param mongoose
 * @param callback
 */
MongoConnect.prototype.connect = function (mongoose, callback) {
    if (typeof callback !== 'function') {
        callback = this.defaultCallback;
    }
    mongoose.set('useNewUrlParser', true);
    mongoose.set('useFindAndModify', false);
    mongoose.set('useCreateIndex', true);   
    logger.info('opneHAB-cloud: Trying to connect to mongodb at: ' + this.getMongoUri());
    mongoose.connect(this.getMongoUri(), callback);
};

/**
 * The callback used in #connect, if no callback was provided.
 *
 * @param error
 * @private
 */
MongoConnect.prototype.defaultCallback = function (error) {
    if (error) {
        logger.error('openHAB-cloud: Error while connecting from openHAB-cloud to mongodb: ' + error);
        logger.error('openHAB-cloud: Stopping openHAB-cloud due to error with mongodb');
        process.exit(1);
    }

    logger.info('openHAB-cloud: Successfully connected to mongodb');
};

/**
 * Returns the connection string to use to connect to mongodb.
 *
 * @return {string}
 * @private
 */
MongoConnect.prototype.getMongoUri = function () {
    var mongoUri = 'mongodb://';

    if (this.system.hasDbCredentials())
        mongoUri += this.system.getDbUser() + ':' + this.system.getDbPass() + '@';

    mongoUri += this.system.getDbHostsString();

    return mongoUri + '/' + this.system.getDbName() + '?poolSize=50';
};

module.exports = MongoConnect;
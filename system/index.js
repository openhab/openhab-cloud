const url = require('url');
const System = function() {};
const path = require('node:path'); 


/**
 * Sets the configuration object for this System object which should holf the configuration options for this instance
 * of the app.
 * @param {Object} config
 */
System.prototype.setConfiguration = function(config) {
    if (typeof config != 'object')
        throw new Error('config needs to be an object of configuration options, ' + typeof config + ' given.');

    this.config = config;

    // backward-compatibility to the baseurl property
    if (this.config && this.config.system && this.config.system.hasOwnProperty('baseurl')) {
        let parsedUrl, baseurl = this.config.system.baseurl;

        // anything will match, except URLs without protocol, like:
        // localhost:3000
        // localhost/openhab
        // and so on. For these baseurl, for backward-compatibility, the protocol http: is prepended
        if (!baseurl.match(/^.*:?\/\/.*:[0-9]{1,5}/g)) {
            baseurl = 'http://' + baseurl;
        }
        parsedUrl = url.parse(baseurl, false, true);
        this.config.system.host = parsedUrl.hostname;
        this.config.system.port = parsedUrl.port;
        this.config.system.protocol = (parsedUrl.protocol || 'http:').replace(':', '');
    }
};

/**
 * Returns the value of the given configuration or configuration path, if the configuration exists.
 *
 * @param {String|Array} config The configuration name as a string, if it is at the top level of the config
 *  object or as an array of strings, which represents the path to the requested config.
 * @returns {*} The value of the configuration, which can be a string, boolean, object, array or any other supported
 *  data type.
 * @throws Error Throws an error, if the configuration was not set (using #setConfiguration) so far, or the
 *  requested configuration does not exist or couldn't be found at the provided path.
 * @private
 */
System.prototype.getConfig = function(config) {
    let localConfig = this.config;

    if (!this.config)
        throw new Error('No configuration object set so far.');

    if (Array.isArray(config)) {
        config.forEach(function(element) {
            if (localConfig.hasOwnProperty(element))
                localConfig = localConfig[element];
            else
                throw new Error('Could not find configuration path: ' + config + '. Stopped at: ' + element);
        });
        return localConfig;
    }

    if (this.config.hasOwnProperty(config))
        return this.config[config];

    throw new Error('The configuration ' + config +  ' could not be found.');
};

/**
 * Returns the configured host of the system. This can be different from the host where this app is running.
 * @returns {String}
 */
System.prototype.getHost = function() {
    return this.getConfig(['system', 'host']);
};

/**
 * Returns the configured proxy host of the system. This can be different from the host where this app is running.
 * @returns {String}
 */
System.prototype.getProxyHost = function() {
    try {
        return this.getConfig(['system', 'proxyHost']);
    } catch (e) {
        return this.getConfig(['system', 'host']);
    }
};

/**
 * Returns the port configured for this system.
 * @returns {int}
 */
System.prototype.getPort = function() {
    return this.getConfig(['system', 'port']);
};

/**
 * Returns the proxy port configured for this system.
 * @returns {int}
 */
System.prototype.getProxyPort = function() {
    try {
        return this.getConfig(['system', 'proxyPort']);
    } catch (e) {
        return this.getConfig(['system', 'port']);
    }
};

/**
 * Returns the port the node process shoud listen on.
 * @returns {int}
 */
System.prototype.getNodeProcessPort = function() {
    return process.env.PORT || 3000
};

/**
 * Returns the configured protocol to use for this app instance.
 * @returns {String}
 */
System.prototype.getProtocol = function() {
    return this.getConfig(['system', 'protocol']);
};

/**
 * Returns the full base URL of this app, which consists of a protocol, the host and port without a trailing slash.
 * @return {String}
 */
System.prototype.getBaseURL = function() {
    return this.getProtocol() + '://' + this.getHost() + ':' + this.getPort();
};


/**
 * Returns the full base URL of this app, which consists of a protocol, the host and port without a trailing slash.
 * @return {String}
 */
System.prototype.getProxyURL = function() {
    return this.getProtocol() + '://' + this.getProxyHost() + ':' + this.getProxyPort();    
};


/**
 * Returns if we are muting notifications
 * @returns {Boolean}
 */
System.prototype.getMuteNotifications = function() {
  try {
    return this.getConfig(['system', 'muteNotifications']);
  } catch (err) {
    return false;
  }
};

/**
 * Returns the amount of milliseconds to wait until we let users know they are offline
 * @returns {Number}
 */
 System.prototype.getOfflineNotificationTime = function() {
    try {
        return this.getConfig(['system', 'offlineNotificationTime']);
    } catch (e) {
        return 300 * 1000;
    }
};

/**
 * Returns the amount of seconds for openhab connection locks to persist in redis
 * @returns {Number}
 */
System.prototype.getConnectionLockTimeSeconds = function() {
    try {
        return this.getConfig(['system', 'connectionLockTimeSeconds']);
    } catch (e) {
        return 70;
    }
};

/**
 * Checks, if new user registration should be enabled or not.
 *
 * @return {boolean}
 */
System.prototype.isUserRegistrationEnabled = function() {
    try {
        return this.getConfig(['registration_enabled']);
    } catch (err) {
        return true;
    }
};

/**
 * Checks, if there's a legal terms or service link configured or not.
 *
 * @return {boolean}
 */
System.prototype.hasLegalTerms = function() {
    let config;
    try {
        config = this.getConfig(['legal', 'terms']);
        return ((config !== false) && (config !== ""));
    } catch (err) {
        return false;
    }
};

/**
 * Checks, is there's a policy link configured or not.
 *
 * @return {boolean}
 */
System.prototype.hasLegalPolicy = function() {
    let config;
    try {
        config = this.getConfig(['legal', 'policy']);
		return ((config !== false) && (config !== ""));
    } catch (err) {
        return false;
    }
};

/**
 * Checks, if IFTTT is configured and enabled or not.
 *
 * @return {boolean}
 */
System.prototype.isIFTTTEnabled = function() {
    try {
        this.getConfig(['ifttt']);
        return true;
    } catch (err) {
        return false;
    }
};

/**
 * If configured, returns the link to the apple openHAB app or the default habdroid app link.
 *
 * @return {string}
 */
System.prototype.getAppleLink = function() {
    return 'https://itunes.apple.com/app/id' + this.getAppleId();
};

System.prototype.getAppleId = function() {
    let appleId = '492054521';
    try {
        appleId = this.getConfig(['apps', 'appleId']);
    } catch (err) {}

    return  appleId;
};

/**
 * If configured, returns the link to the Android openHAB app in the Google Play Store or the default habdroid app link.
 *
 * @return {string}
 */
System.prototype.getAndroidLink = function () {
    return 'https://play.google.com/store/apps/details?id=' + this.getAndroidId();
};

System.prototype.getAndroidId = function () {
    let playStoreId = 'org.openhab.habdroid';
    try {
        playStoreId = this.getConfig(['apps', 'playStoreId']);
    } catch (err) {}

    return playStoreId;
};

/**
 * Returns true, if Google Cloud Message seems to be configured, false otherwise.
 * @return {boolean}
 */
System.prototype.isGcmConfigured = function() {
    try {
        this.getGcmSenderId() && this.getFirebaseServiceFile();
        return true;
    } catch(e) {
        return false;
    }
};

/**
 * Returns the sender ID of GCM, if it exists, throws an error otherwise.
 *
 * @return {*}
 */
System.prototype.getGcmSenderId = function() {
    return this.getConfig(['gcm', 'senderId']);
};

/**
 * Returns the location of the Firebase Service Account File relative to the project base, if it exists, throws an error otherwise.
 *
 * @return {*}
 */
System.prototype.getFirebaseServiceFile = function() {
    return path.resolve(this.getConfig(['gcm', 'serviceFile']));
};

/**
 * Returns true, if credentials for the database access are set, false otherwise. This function will return true only,
 * if both, a username and a password, if configured, not if only one of them is set.
 *
 * @return {boolean}
 */
System.prototype.hasDbCredentials = function() {
    try {
        this.getDbUser();
        this.getDbPass();
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Returns the user which should be used to connect to the database. If no user is set, this
 * function will throw an error.
 *
 * @return {*}
 */
System.prototype.getDbUser = function() {
    return this.getConfig(['mongodb', 'user']);
};

/**
 * Returns the password which should be used to connect to the database. If no password is set, this
 * function will throw an error.
 *
 * @return {*}
 */
System.prototype.getDbPass = function() {
    return this.getConfig(['mongodb', 'password']);
};

/**
 * Returns the string representation of the configured database hosts.
 *
 * @return {string}
 */
System.prototype.getDbHostsString = function() {
    let dbHostsResult = '',
        dbHosts = this.getConfig(['mongodb', 'hosts']);

    dbHostsResult += dbHosts;

    return dbHostsResult;
};

/**
 * Returns the database name to use for the database connection.
 *
 * @return {*}
 */
System.prototype.getDbName = function() {
    return this.getConfig(['mongodb', 'db']);
};

/**
 * Returns the string representation of interal address in the form host:port
 *
 * @return {string}
 */
System.prototype.getInternalAddress = function() {
  return process.env.HOST + ":" + process.env.PORT;
};

/**
 * Returns the logging level used for winston. Defaults to 'debug'
 */
System.prototype.getLoggerLevel = function() {
    try {
        return this.getConfig(['system', 'logger', 'level']);
    } catch (e) {
        return 'debug';
    }
};

/**
 * Returs the directory logs should be written to.  Defaults to './log/'
 */
System.prototype.getLoggerDir = function() {
    try {
        let dir = this.getConfig(['system', 'logger', 'dir']);
        if(!dir.endsWith('/')){
            dir += '/'
        }
        return dir;
    } catch (e) {
        return './logs/';
    }
};

/**
 * Returns the max number of days logs should be retained for.  Defaults to '7d' (7 days)
 */
System.prototype.getLoggerMaxFiles = function() {
    try {
        return this.getConfig(['system', 'logger', 'maxFiles']);
    } catch (e) {
        return '7d';
    }
};

/**
 * Returns the morgan request logger option.  Defaults to null (disables morgan logging)
 */
System.prototype.getLoggerMorganOption = function() {
    try {
        return this.getConfig(['system', 'logger', 'morgan']);
    } catch (e) {
        return null;
    }
};

/**
 * Returns the type of logging used (either file or console).  Defaults to file
 */
System.prototype.getLoggerType = function() {
    try {
        return this.getConfig(['system', 'logger', 'type']);
    } catch (e) {
        return 'file';
    }
};

/**
 * Returns true, if health endpoint is enabled.
 * @return {boolean}
 */
System.prototype.isHealthEndpointEnabled = function() {
    try {
        return this.getConfig(['system', 'healthEndpoint', 'enabled']);
    } catch(e) {
        return false;
    }
};

module.exports = new System();

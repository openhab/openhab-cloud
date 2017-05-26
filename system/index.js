var url = require('url');
var System = function() {};

/**
 * The suffix, which is appended to the GCM sender ID to build the full jid.
 *
 * @type {string}
 */
System.jidSuffix = '@gcm.googleapis.com';

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
        var parsedUrl, baseurl = this.config.system.baseurl;

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

    // backward-compatibility to jid/senderId setting of GCM
    if (this.config && this.config.gcm && this.config.gcm.hasOwnProperty('jid')) {
        var splittedConfig = this.config.gcm.jid.split('@');

        if (splittedConfig.length !== 2) {
            throw new Error('The Google Cloud Message JID needs to be of format: jid' + System.jidSuffix + ' but got:' +
                this.config.gcm.jid + '. Can\'t migrate to use sender ID only.');
        }
        this.config.gcm.senderId = splittedConfig[0];
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
    var localConfig = this.config;

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
 * Returns the port configured for this system.
 * @returns {int}
 */
System.prototype.getPort = function() {
    return this.getConfig(['system', 'port']);
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
 * If configured, returns the link to the apple openHAB app or the default habdroid app link.
 *
 * @return {string}
 */
System.prototype.getAppleLink = function() {
    var appleId = '492054521';
    try {
        appleId = this.getConfig(['apps', 'appleId']);
    } catch (err) {}

    return 'https://itunes.apple.com/app/id' + appleId;
};

/**
 * If configured, returns the link to the Android openHAB app in the Google Play Store or the default habdroid app link.
 *
 * @return {string}
 */
System.prototype.getAndroidLink = function () {
    var playStoreId = 'org.openhab.habdroid';
    try {
        playStoreId = this.getConfig(['apps', 'playStoreId']);
    } catch (err) {}

    return 'https://play.google.com/store/apps/details?id=' + playStoreId;
};

/**
 * Returns true, if Google Cloud Message seems to be configured, false otherwise.
 * @return {boolean}
 */
System.prototype.isGcmConfigured = function() {
    try {
        this.getGcmSenderId();
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
 * Returns the JID used to login to GCM services, if the sender ID is set. Throws an error otherwise.
 *
 * @return {string}
 */
System.prototype.getGcmJid = function() {
    return this.getGcmSenderId() + System.jidSuffix;
};

/**
 * Returns the configured pssword for GCM for the configured sender ID. If it isn't set, it throws an error.
 *
 * @return {*}
 */
System.prototype.getGcmPassword = function() {
    return this.getConfig(['gcm', 'password']);
};

module.exports = new System();
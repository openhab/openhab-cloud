var system = require('../system'),
    homepage = require('./homepage'),
    passport = require('passport'),
    account_routes = require('./account'),
    devices_routes = require('./devices'),
    applications_routes = require('./applications'),
    events_routes = require('./events'),
    items_routes = require('./items'),
    notifications_routes = require('./notifications'),
    configsystem_routes = require('./configsystem'),
    invitations_routes = require('./invitations'),
    users_routes = require('./users'),
    staff_routes = require('./staff'),
    api_routes = require('./api'),
    oauth2 = require('./oauth2'),
    setSessionTimezone = require('./setTimezone'),
    ifttt_routes = require('./ifttt');

/**
 * Constructs the Routes object.
 *
 * @param {Object} restRequests
 * @param {logger} logger
 * @constructor
 */
var Routes = function (restRequests, logger) {
    // TODO: Don't use a plain shared object. Maybe an instance of an object with defined functions would be better to
    // understand.
    this.requests = restRequests;
    // A request counter for issuing a uniqe ID to every request when sending them to openHABs
    this.requestCounter = 0;
    this.logger = logger;
};

/**
 * @deprecated This function should not be used and will be returned as far as a better solution was found.
 * @param io
 */
Routes.prototype.setSocketIO = function (io) {
    this.io = io;
};

Routes.prototype.setupRoutes = function (app) {
    this.setupGeneralRoutes(app);
    this.setupLoginLogoutRoutes(app);
    this.setupNewUserRegistrationRoutes(app);
    this.setupAccountRoutes(app);
    this.setupDevicesRoutes(app);
    this.setupApplicationsRoutes(app);
    this.setupInvitationRoutes(app);
    this.setupUserManagementRoutes(app);
    this.setupSystemConfigurationRoutes(app);
    this.setupOAuthRoutes(app);
    this.setupIFTTTRoutes(app);
    this.setupTimezoneRoutes(app);
    this.setupApiRoutes(app);
    this.setupStaffRoutes(app);
    this.setupProxyRoutes(app);
    this.setupAppRoutes(app);
};

Routes.prototype.setupGeneralRoutes = function (app) {
    // General homepage
    app.get('/', homepage.index);

    // V2 route - response to this route means this openHAB-cloud is using v2 transport based on socket.io 1.0
    app.get('/v2', homepage.getv2);

    // Events
    app.get('/events', this.ensureAuthenticated, events_routes.eventsget);

    // Items
    app.get('/items', this.ensureAuthenticated, items_routes.itemsget);

    // Notifications
    app.get('/notifications', this.ensureAuthenticated, notifications_routes.notificationsget);
};

Routes.prototype.setupLoginLogoutRoutes = function (app) {
    app.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });

    app.get('/login', function (req, res) {
        var errormessages = req.flash('error'),
            invitationCode;

        if (req.query['invitationCode'] !== null) {
            invitationCode = req.query['invitationCode'];
        } else {
            invitationCode = '';
        }

        res.render('login', {
            title: 'Log in',
            user: req.user,
            errormessages: errormessages,
            infomessages: req.flash('info'),
            invitationCode: invitationCode
        });
    });

    app.post('/login', passport.authenticate('local', {
        successReturnToOrRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true
    }));
};

Routes.prototype.setupAccountRoutes = function (app) {
    app.get('/account', this.ensureAuthenticated, account_routes.accountget);
    app.post('/account', this.ensureAuthenticated, this.ensureMaster, account_routes.accountpostvalidate, account_routes.accountpost);
    app.post('/accountpassword', this.ensureAuthenticated, account_routes.accountpasswordpostvalidate, account_routes.accountpasswordpost);
    app.get('/accountdelete', this.ensureAuthenticated, this.ensureMaster, account_routes.accountdeleteget);
    app.post('/accountdelete', this.ensureAuthenticated, this.ensureMaster, account_routes.accountdeletepost);
    app.get('/itemsdelete', this.ensureAuthenticated, this.ensureMaster, account_routes.itemsdeleteget);
    app.post('/itemsdelete', this.ensureAuthenticated, this.ensureMaster, account_routes.itemsdeletepost);
};

Routes.prototype.setupDevicesRoutes = function (app) {
    app.get('/devices', this.ensureAuthenticated, devices_routes.devicesget);
    app.get('/devices/:id', this.ensureAuthenticated, devices_routes.devicesget);
    app.get('/devices/:id/delete', this.ensureAuthenticated, devices_routes.devicesdelete);
    app.post('/devices/:id/sendmessage', this.ensureAuthenticated, devices_routes.devicessendmessagevalidate, devices_routes.devicessendmessage);
};

Routes.prototype.setupApplicationsRoutes = function (app) {
    app.get('/applications', this.ensureAuthenticated, applications_routes.applicationsget);
    app.get('/applications/:id/delete', this.ensureAuthenticated, applications_routes.applicationsdelete);
};

Routes.prototype.setupNewUserRegistrationRoutes = function (app) {
    var registerPostValidate = account_routes.registerpostvalidateall;

    if (!system.hasLegalTerms() && !system.hasLegalPolicy()) {
        registerPostValidate = account_routes.registerpostvalidate;
    }
    app.post('/register', registerPostValidate, account_routes.registerpost);
    app.get('/verify', account_routes.verifyget);

    // Enroll for beta - old URLs, both of them respond with redirects to /login
    app.get('/enroll', account_routes.enrollget);
    app.post('/enroll', account_routes.enrollpost);
};

Routes.prototype.setupInvitationRoutes = function (app) {
    app.get('/invitations', this.ensureAuthenticated, invitations_routes.invitationsget);
    app.post('/invitations', this.ensureAuthenticated, invitations_routes.invitationspostvalidate, invitations_routes.invitationspost);
    app.get('/lostpassword', account_routes.lostpasswordget);
    app.post('/lostpassword', account_routes.lostpasswordpostvalidate, account_routes.lostpasswordpost);
    app.get('/lostpasswordreset', account_routes.lostpasswordresetget);
    app.post('/lostpasswordreset', account_routes.lostpasswordresetpostvalidate, account_routes.lostpasswordresetpost);
};

Routes.prototype.setupUserManagementRoutes = function (app) {
    app.get('/users', this.ensureAuthenticated, this.ensureMaster, users_routes.usersget);
    app.get('/users/add', this.ensureAuthenticated, this.ensureMaster, users_routes.usersaddget);
    app.post('/users/add', this.ensureAuthenticated, this.ensureMaster, users_routes.usersaddpostvalidate, users_routes.usersaddpost);
    app.get('/users/delete/:id', this.ensureAuthenticated, this.ensureMaster, users_routes.usersdeleteget);
    app.get('/users/:id', this.ensureAuthenticated, this.ensureMaster, users_routes.usersget);
};

Routes.prototype.setupSystemConfigurationRoutes = function (app) {
    app.get('/config/system', this.ensureAuthenticated, configsystem_routes.get);
    app.get('/config/system/:id', this.ensureAuthenticated, configsystem_routes.get);
};

Routes.prototype.setupOAuthRoutes = function (app) {
    app.get('/oauth2/authorize', this.ensureAuthenticated, oauth2.authorization);
    app.post('/oauth2/authorize/decision', this.ensureAuthenticated, oauth2.decision);
    app.post('/oauth2/token', oauth2.token);
};

Routes.prototype.setupStaffRoutes = function (app) {
    app.get('/staff', this.ensureAuthenticated, this.ensureStaff, staff_routes.staffget);
    app.get('/staff/processenroll/:id', this.ensureAuthenticated, this.ensureStaff, staff_routes.processenroll);
    app.get('/staff/stats', this.ensureAuthenticated, this.ensureStaff, staff_routes.statsget);
    app.get('/staff/invitations', this.ensureAuthenticated, this.ensureStaff, staff_routes.invitationsget);
    app.get('/staff/resendinvitation/:id', this.ensureAuthenticated, this.ensureStaff, staff_routes.resendinvitation);
    app.get('/staff/deleteinvitation/:id', this.ensureAuthenticated, this.ensureStaff, staff_routes.deleteinvitation);
    app.get('/staff/oauthclients', this.ensureAuthenticated, this.ensureStaff, staff_routes.oauthclientsget);
};

Routes.prototype.setupIFTTTRoutes = function (app) {
    if (!system.isIFTTTEnabled()) {
        return;
    }
    this.logger.info('openHAB-cloud: IFTTT is configured, app handling IFTTT capabilities...');
    app.get('/ifttt/v1/user/info', ifttt_routes.userinfo);
    app.get('/ifttt/v1/status', ifttt_routes.v1status);
    app.post('/ifttt/v1/test/setup', ifttt_routes.v1testsetup);
    app.post('/ifttt/v1/actions/command', ifttt_routes.v1actioncommand);
    app.post('/ifttt/v1/actions/command/fields/item/options', ifttt_routes.v1actioncommanditemoptions);
    app.post('/ifttt/v1/triggers/itemstate', ifttt_routes.v1triggeritemstate);
    app.post('/ifttt/v1/triggers/itemstate/fields/item/options', ifttt_routes.v1actioncommanditemoptions);
    app.post('/ifttt/v1/triggers/item_raised_above', ifttt_routes.v1triggeritem_raised_above);
    app.post('/ifttt/v1/triggers/item_raised_above/fields/item/options', ifttt_routes.v1actioncommanditemoptions);
    app.post('/ifttt/v1/triggers/item_dropped_below', ifttt_routes.v1triggeritem_dropped_below);
    app.post('/ifttt/v1/triggers/item_dropped_below/fields/item/options', ifttt_routes.v1actioncommanditemoptions);
};

Routes.prototype.setupTimezoneRoutes = function (app) {
    // A route to set session timezone automatically detected in browser
    app.all('/setTimezone', setSessionTimezone);
};

Routes.prototype.setupApiRoutes = function (app) {
    app.get('/api/events', this.ensureAuthenticated, events_routes.eventsvaluesget);
};

Routes.prototype.setupProxyRoutes = function (app) {
    app.all('/rest*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/images/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/static/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/rrdchart.png*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/chart*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/openhab.app*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/WebApp*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/CMD*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/cometVisu*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/proxy*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/greent*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/jquery.*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/classicui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/paperui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/basicui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/doc/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/start/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/icon*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/habmin/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/remote*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
    app.all('/habpanel/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.proxyRouteOpenhab.bind(this));
};

Routes.prototype.setupAppRoutes = function (app) {
    // myOH API for mobile apps
    app.all('/api/v1/notifications*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, api_routes.notificationsget);

    // Android app registration
    app.all('/addAndroidRegistration*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.addAndroidRegistration);
    app.all('/addAppleRegistration*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.addAppleRegistration);
};

/**
 * TODO: Extract this function to it's own helper module.
 *
 * @param req
 * @param res
 */
Routes.prototype.addAndroidRegistration = function (req, res) {
    var self = this;

    if (!req.query.hasOwnProperty('regId')) {
        res.send(404, 'Parameters missing');
        return;
    }
    var registrationId = req.query['regId'];
    var deviceId;
    var deviceModel;
    if (req.query.hasOwnProperty('deviceId')) {
        deviceId = req.query['deviceId'];
    } else {
        deviceId = 'unknown';
    }
    if (req.query.hasOwnProperty('deviceModel')) {
        deviceModel = req.query['deviceModel'];
    } else {
        deviceModel = 'unknown';
    }
    // Try to find user device by device Id
    UserDevice.findOne({
        owner: req.user.id,
        deviceType: 'android',
        deviceId: deviceId
    }, function (error, userDevice) {
        if (error) {
            self.logger.warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }

        if (userDevice) {
            // If found, update the changed registration id
            self.logger.info('openHAB-cloud: Found an Android device for user ' + req.user.username + ', updating');
            userDevice.androidRegistration = registrationId;
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    self.logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, try to find device by registration id. Sometimes android devices change their
            // ids dynamically, while google play services continue to return the same registration id
            // so this is still the same device and we don't want any duplicates
            self.findAndroidDeviceByRegistrationId(req, registrationId, res, deviceId, deviceModel);
        }
    });
};
/**
 * Tries to find an android device using the registration ID and sets the given deviceId to this UserDevice.
 *
 * @param req
 * @param registrationId
 * @param res
 * @param deviceId
 * @param deviceModel
 */
Routes.prototype.findAndroidDeviceByRegistrationId = function (req, registrationId, res, deviceId, deviceModel) {
    var self = this;

    UserDevice.findOne({
            owner: req.user.id,
            deviceType: 'android',
            androidRegistration: registrationId
        },
        function (error, userDevice) {
            if (error) {
                self.logger.warn('openHAB-cloud: Error looking up device: ' + error);
                res.send(500, 'Internal server error');
                return;
            }
            if (userDevice) {
                // If found, update the changed device id
                userDevice.deviceId = deviceId;
                userDevice.lastUpdate = new Date();
                userDevice.save(function (error) {
                    if (error) {
                        self.logger.error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Updated');
            } else {
                // If not found, finally register a new one
                userDevice = new UserDevice({
                    owner: req.user.id,
                    deviceType: 'android',
                    deviceId: deviceId,
                    androidRegistration: registrationId,
                    deviceModel: deviceModel,
                    lastUpdate: new Date(),
                    registered: new Date()
                });
                userDevice.save(function (error) {
                    if (error) {
                        self.logger.error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Added');
            }
        });
};

/**
 * TODO: Extract this method to it's own helper module.
 *
 * @param req
 * @param res
 */
Routes.prototype.addAppleRegistration = function (req, res) {
    var self = this;

    if (!req.query.hasOwnProperty('regId')) {
        res.send(404, 'Parameters missing');
        return;
    }
    var registrationId = req.query['regId'];
    var deviceId;
    var deviceModel;
    if (req.query.hasOwnProperty('deviceId')) {
        deviceId = req.query['deviceId'];
    } else {
        deviceId = 'unknown';
    }
    if (req.query.hasOwnProperty('deviceModel')) {
        deviceModel = req.query['deviceModel'];
    } else {
        deviceModel = 'unknown';
    }
    UserDevice.findOne({
        owner: req.user.id,
        deviceType: 'ios',
        deviceId: deviceId
    }, function (error, userDevice) {
        if (error) {
            self.logger.warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }
        if (userDevice) {
            // If found, update device token and save
            self.logger.info('openHAB-cloud: Found iOS device for user ' + req.user.username + ', updating');
            userDevice.iosDeviceToken = registrationId;
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    self.logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, add new device registration
            self.logger.info('openHAB-cloud: Registering new iOS device for user ' + req.user.username);
            userDevice = new UserDevice({
                owner: req.user.id,
                deviceType: 'ios',
                deviceId: deviceId,
                iosDeviceToken: registrationId,
                deviceModel: deviceModel,
                lastUpdate: new Date(),
                registered: new Date()
            });
            userDevice.save(function (error) {
                if (error) {
                    self.logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Added');
        }
    });
};

// Ensure user is authenticated for web requests
Routes.prototype.ensureAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl || req.url;
    res.redirect('/login');
};

// Ensure user is authenticated for REST or proxied requets
Routes.prototype.ensureRestAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    return passport.authenticate(['basic','bearer'], {session: false})(req, res, next);
};

// Ensure user have 'master' role for certain homepage
Routes.prototype.ensureMaster = function (req, res, next) {
    if (req.user.role === 'master') {
        return next();
    }
    res.redirect('/');
};

// Ensure user is from 'staff' group for certain homepage
Routes.prototype.ensureStaff = function (req, res, next) {
    if (req.user.group === 'staff') {
        return next();
    }
    res.redirect('/');
};

Routes.prototype.setOpenhab = function (req, res, next) {
    var self = this;

    req.user.openhab(function (error, openhab) {
        if (!error && openhab) {
            req.openhab = openhab;
            next();
            return;
        }
        if (error) {
            self.logger.error('openHAB-cloud: openHAB lookup error: ' + error);
            return res.status(500).json({
                errors: [{
                    message: error
                }]
            });
        } else {
            self.logger.warn('openHAB-cloud: Can\'t find the openHAB of user which is unbelievable');
            return res.status(500).json({
                errors: [{
                    message: 'openHAB not found'
                }]
            });
        }
    });
};

Routes.prototype.preassembleBody = function (req, res, next) {
    var data = '';
    req.on('data', function (chunk) {
        data += chunk;
    });
    req.on('end', function () {
        req.rawBody = data;
        next();
    });
};

Routes.prototype.proxyRouteOpenhab = function (req, res) {
    var self = this;

    req.connection.setTimeout(600000);

    if (req.openhab.status === 'offline') {
        res.writeHead(500, 'openHAB is offline', {
            'content-type': 'text/plain'
        });
        res.end('openHAB is offline');
        return;
    }

    // TODO: migrate this to redis incr?
    // increment request id and fix it
    this.requestCounter++;
    var requestId = this.requestCounter;
    // make a local copy of request headers to modify
    var requestHeaders = req.headers;
    // We need to remove and modify some headers here
    delete requestHeaders['cookie'];
    delete requestHeaders['cookie2'];
    delete requestHeaders['authorization'];
    delete requestHeaders['x-real-ip'];
    delete requestHeaders['x-forwarded-for'];
    delete requestHeaders['x-forwarded-proto'];
    delete requestHeaders['connection'];
    requestHeaders['host'] = req.headers.host || system.getHost() + ':' + system.getPort();
    requestHeaders['user-agent'] = 'openhab-cloud/0.0.1';
    // Strip off path prefix for remote vhosts hack
    var requestPath = req.path;
    if (requestPath.indexOf('/remote/') === 0) {
        requestPath = requestPath.replace('/remote', '');
        // TODO: this is too dirty :-(
        delete requestHeaders['host'];
        requestHeaders['host'] = 'home.' + system.getHost() + ':' + system.getPort();
    }

    // Send a message with request to openhab agent module
    this.io.sockets.in(req.openhab.uuid).emit('request', {
        id: requestId,
        method: req.method,
        headers: requestHeaders,
        path: requestPath,
        query: req.query,
        body: req.rawBody
    });
    res.openhab = req.openhab;
    this.requests[requestId] = res;

    //we should only have to catch these two callbacks to hear about the response
    //being close/finished, but thats not the case. Sometimes neither gets called
    //and we have to manually clean up.  We have a interval for this above.

    //when a response is closed by the requester
    res.on('close', function () {
        self.io.sockets.in(req.openhab.uuid).emit('cancel', {
            id: requestId
        });
        delete self.requests[requestId];
    });

    //when a response is closed by us
    res.on('finish', function () {
        delete self.requests[requestId];
    });
};

module.exports = Routes;
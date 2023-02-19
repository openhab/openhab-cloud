var system = require('../system'),
    homepage = require('./homepage'),
    passport = require('passport'),
    account_routes = require('./account'),
    devices_routes = require('./devices'),
    applications_routes = require('./applications'),
    events_routes = require('./events'),
    items_routes = require('./items'),
    notifications_routes = require('./notifications'),
    invitations_routes = require('./invitations'),
    users_routes = require('./users'),
    staff_routes = require('./staff'),
    api_routes = require('./api'),
    oauth2 = require('./oauth2'),
    setSessionTimezone = require('./setTimezone'),
    androidRegistrationService = require('./androidRegistrationService'),
    appleRegistrationService = require('./appleRegistrationService'),
    ifttt_routes = require('./ifttt'),
    redis = require('../redis-helper');

/**
 * Constructs the Routes object.
 *
 * @param {logger} logger
 * @constructor
 */
var Routes = function (logger) {
    this.logger = logger;
};

/**
 * @param socketIO
 */
Routes.prototype.setSocketIO = function (socketIO) {
    this.io = socketIO.io;
    this.requestTracker = socketIO.requestTracker
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
    this.setupOAuthRoutes(app);
    this.setupIFTTTRoutes(app);
    this.setupTimezoneRoutes(app);
    this.setupStaffRoutes(app);
    this.setupProxyRoutes(app);
    this.setupAppRoutes(app);
};

Routes.prototype.setupGeneralRoutes = function (app) {
    // General homepage
    app.get('/', this.setOpenhab, homepage.index);

    // Events
    app.get('/events', this.ensureAuthenticated, this.setOpenhab, events_routes.eventsget);

    // Items
    app.get('/items', this.ensureAuthenticated, this.setOpenhab, items_routes.itemsget);

    // Notifications
    app.get('/notifications', this.ensureAuthenticated, this.setOpenhab, notifications_routes.notificationsget);
};

Routes.prototype.setupLoginLogoutRoutes = function (app) {
    app.get('/logout', function (req, res, next) {
        req.logout(function (err) {
            if (err) { return next(err); }
            res.redirect('/');
        });
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

    app.post('/login', account_routes.loginpostvalidate,
        //use express-form sanitized data for passport  
        function (req, res, next) {
            req.body.username = req.form.username;
            req.body.password = req.form.password;
            next();
        },
        passport.authenticate('local', {
            successReturnToOrRedirect: '/',
            failureRedirect: '/login',
            failureFlash: true
        }));
};

Routes.prototype.setupAccountRoutes = function (app) {
    app.get('/account', this.ensureAuthenticated, this.setOpenhab, account_routes.accountget);
    app.post('/account', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, account_routes.accountpostvalidate, account_routes.accountpost);
    app.post('/accountpassword', this.ensureAuthenticated, this.setOpenhab, account_routes.accountpasswordpostvalidate, account_routes.accountpasswordpost);
    app.get('/accountdelete', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, account_routes.accountdeleteget);
    app.post('/accountdelete', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, account_routes.accountdeletepost);
    app.get('/itemsdelete', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, account_routes.itemsdeleteget);
    app.post('/itemsdelete', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, account_routes.itemsdeletepost);
};

Routes.prototype.setupDevicesRoutes = function (app) {
    app.get('/devices', this.ensureAuthenticated, this.setOpenhab, devices_routes.devicesget);
    app.get('/devices/:id', this.ensureAuthenticated, this.setOpenhab, devices_routes.devicesget);
    app.get('/devices/:id/delete', this.ensureAuthenticated, this.setOpenhab, devices_routes.devicesdelete);
    app.post('/devices/:id/sendmessage', this.ensureAuthenticated, this.setOpenhab, devices_routes.devicessendmessagevalidate, devices_routes.devicessendmessage);
};

Routes.prototype.setupApplicationsRoutes = function (app) {
    app.get('/applications', this.ensureAuthenticated, this.setOpenhab, applications_routes.applicationsget);
    app.get('/applications/:id/delete', this.ensureAuthenticated, this.setOpenhab, applications_routes.applicationsdelete);
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
    app.get('/invitations', this.ensureAuthenticated, this.setOpenhab, invitations_routes.invitationsget);
    app.post('/invitations', this.ensureAuthenticated, this.setOpenhab, invitations_routes.invitationspostvalidate, invitations_routes.invitationspost);
    app.get('/lostpassword', account_routes.lostpasswordget);
    app.post('/lostpassword', account_routes.lostpasswordpostvalidate, account_routes.lostpasswordpost);
    app.get('/lostpasswordreset', account_routes.lostpasswordresetget);
    app.post('/lostpasswordreset', account_routes.lostpasswordresetpostvalidate, account_routes.lostpasswordresetpost);
};

Routes.prototype.setupUserManagementRoutes = function (app) {
    app.get('/users', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, users_routes.usersget);
    app.get('/users/add', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, users_routes.usersaddget);
    app.post('/users/add', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, users_routes.usersaddpostvalidate, users_routes.usersaddpost);
    app.get('/users/delete/:id', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, users_routes.usersdeleteget);
    app.get('/users/:id', this.ensureAuthenticated, this.setOpenhab, this.ensureMaster, users_routes.usersget);
};

Routes.prototype.setupOAuthRoutes = function (app) {
    app.get('/oauth2/authorize', this.ensureAuthenticated, oauth2.authorization);
    app.post('/oauth2/authorize/decision', this.ensureAuthenticated, oauth2.decision);
    app.post('/oauth2/token', oauth2.token);
};

Routes.prototype.setupStaffRoutes = function (app) {
    app.get('/staff', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.staffget);
    app.get('/staff/processenroll/:id', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.processenroll);
    app.get('/staff/stats', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.statsget);
    app.get('/staff/invitations', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.invitationsget);
    app.get('/staff/resendinvitation/:id', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.resendinvitation);
    app.get('/staff/deleteinvitation/:id', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.deleteinvitation);
    app.get('/staff/oauthclients', this.ensureAuthenticated, this.setOpenhab, this.ensureStaff, staff_routes.oauthclientsget);
};

Routes.prototype.setupIFTTTRoutes = function (app) {
    if (!system.isIFTTTEnabled()) {
        return;
    }
    this.logger.info('IFTTT is configured, app handling IFTTT capabilities...');
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

Routes.prototype.setupProxyRoutes = function (app) {
    app.all('/rest*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/images/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/static/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/rrdchart.png*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/chart*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/openhab.app*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/WebApp*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/CMD*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/cometVisu*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/proxy*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/greent*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/jquery.*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/classicui/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/paperui/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/basicui/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/doc/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/start/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/icon*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/habmin/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/remote*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/habpanel/*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, this.ensureServer, this.proxyRouteOpenhab.bind(this));
};

Routes.prototype.setupAppRoutes = function (app) {
    // myOH API for mobile apps
    app.all('/api/v1/notifications*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, api_routes.notificationsget);
    app.all('/api/v1/settings/notifications', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, api_routes.notificationssettingsget);

    // Android app registration
    app.all('/addAndroidRegistration*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, androidRegistrationService);
    app.all('/addAppleRegistration*', this.ensureRestAuthenticated, this.setOpenhab, this.preassembleBody, appleRegistrationService);
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
    return passport.authenticate(['basic', 'bearer'], { session: false })(req, res, next);
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

/**
* Certain requests must be served from the same server that a user's openHAB
* is connected to.  If we are not the right server we will send a redirect upstream
* which should be handled internally by nginx, and not the requesting client
**/
Routes.prototype.ensureServer = function (req, res, next) {
    if (!req.connectionInfo.serverAddress) {
        res.writeHead(500, 'openHAB is offline', {
            'content-type': 'text/plain'
        });
        res.end('openHAB is offline');
        return;
    }

    if (req.connectionInfo.serverAddress != system.getInternalAddress()) {
        //redirect a request to correct cloud server
        res.redirect(307, 'http://' + req.connectionInfo.serverAddress + req.path);
        return;
    }

    res.cookie('CloudServer', system.getInternalAddress(), { maxAge: 900000, httpOnly: true });
    return next();
};

Routes.prototype.setOpenhab = function (req, res, next) {
    var self = this;

    //ignore if no authentication
    if (!req.isAuthenticated()) {
        return next();
    }

    req.user.openhab(function (error, openhab) {
        if (error) {
            self.logger.error('openHAB lookup error: ' + error);
            return res.status(500).json({
                errors: [{
                    message: error
                }]
            });
        }

        if (!openhab) {
            self.logger.warn('Can\'t find the openHAB of user which is unbelievable');
            return res.status(500).json({
                errors: [{
                    message: 'openHAB not found'
                }]
            });
        }

        req.openhab = openhab;
        res.locals.openhab = openhab;
        res.locals.openhablastonline = openhab.last_online;

        //Pulls connection info from redis and makes available to further calls and templates (local values)
        redis.get('connection:' + req.openhab.id, (error, result) => {
            if (error) {
                self.logger.error('openHAB redis lookup error: ' + error);
            }
            if (!result) {
                req.connectionInfo = {};
                res.locals.openhabstatus = "offline";
                res.locals.openhabMajorVersion = 0;
            } else {
                req.connectionInfo = JSON.parse(result)
                res.locals.openhabstatus = "online"
                if (req.connectionInfo.openhabVersion !== undefined) {
                    res.locals.openhabMajorVersion = parseInt(req.connectionInfo.openhabVersion.split('.')[0]);
                } else {
                    res.locals.openhabMajorVersion = 0;
                }
            }
            return next();
        });
    });
};

Routes.prototype.preassembleBody = function (req, res, next) {
    //app.js will catch any JSON or URLEncoded related requests and
    //store the rawBody on the request, all other requests need
    //to have that data collected and stored here
    var data = '';
    if (req.rawBody === undefined || req.rawBody === "") {
        req.on('data', function (chunk) {
            data += chunk;
        });
        req.on('end', function () {
            req.rawBody = data;
            next();
        });
    } else {
        req.rawBody = req.rawBody.toString();
        next();
    }
};

Routes.prototype.proxyRouteOpenhab = function (req, res) {
    var self = this;

    this.logger.auditRequest(req);
    req.connection.setTimeout(600000);

    //tell OH3 to use alternative Authentication header
    res.cookie('X-OPENHAB-AUTH-HEADER', 'true')

    var requestId = this.requestTracker.acquireRequestId();
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
    this.requestTracker.add(res, requestId);

    res.on('finish', function () {
        self.requestTracker.remove(requestId);
    });

    // if 'closed' is emitted but 'finish' is not, cancel the event.
    // this functionaility changed in node 12, not sure if this gets called like we think.
    // see https://github.com/nodejs/node/issues/21063
    res.on('close', function () {
        // if we are tracking this, 'finish' was not emitted
        if (self.requestTracker.has(requestId)) {
            self.io.sockets.in(req.openhab.uuid).emit('cancel', {
                id: requestId
            });
            self.requestTracker.remove(requestId);
        }
    });
};

module.exports = Routes;

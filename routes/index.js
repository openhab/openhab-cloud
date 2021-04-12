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
    androidRegistrationService = require('./androidRegistrationService'),
    appleRegistrationService = require('./appleRegistrationService');
    ifttt_routes = require('./ifttt');

/**
 * Constructs the Routes object.
 *
 * @param {RequestTracker} requestTracker
 * @param {logger} logger
 * @constructor
 */
var Routes = function (requestTracker, logger) {
    this.requestTracker = requestTracker;
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

    app.post('/login', account_routes.loginpostvalidate, 
    //use express-form sanitized data for passport  
    function(req, res, next) {
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
    app.all('/rest*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/images/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/static/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/rrdchart.png*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/chart*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/openhab.app*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/WebApp*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/CMD*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/cometVisu*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/proxy*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/greent*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/jquery.*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/classicui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/paperui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/basicui/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/doc/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/start/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/icon*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/habmin/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/remote*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
    app.all('/habpanel/*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, this.ensureServer, this.proxyRouteOpenhab.bind(this));
};

Routes.prototype.setupAppRoutes = function (app) {
    // myOH API for mobile apps
    app.all('/api/v1/notifications*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, api_routes.notificationsget);
    app.all('/api/v1/settings/notifications', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, api_routes.notificationssettingsget);

    // Android app registration
    app.all('/addAndroidRegistration*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, androidRegistrationService);
    app.all('/addAppleRegistration*', this.ensureRestAuthenticated, this.preassembleBody, this.setOpenhab, appleRegistrationService);
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

/**
* Certain requests must be served from the same server that a user's openHAB
* is connected to.  If we are not the right server we will send a redirect upstream
* which should be handled internally by nginx, and not the requesting client
**/
Routes.prototype.ensureServer = function(req, res, next) {
  if (req.openhab.serverAddress != system.getInternalAddress()){
    //redirect a request to correct cloud server
    res.redirect(307, 'http://' + req.openhab.serverAddress + req.path);
  } else {
    res.cookie('CloudServer',system.getInternalAddress(), { maxAge: 900000, httpOnly: true });
    return next();
  }
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

Routes.prototype.preassembleBody = function(req, res, next) {
  //app.js will catch any JSON or URLEncoded related requests and
  //store the rawBody on the request, all other requests need
  //to have that data collected and stored here
  var data = '';
  if (req.rawBody === undefined || req.rawBody === "") {
    req.on('data', function(chunk) {
      data += chunk;
    });
    req.on('end', function() {
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

    for(var i in req.headers)
    {
        this.logger.debug("In: " + i + " -> " + req.headers[i]);
    }

    req.connection.setTimeout(600000);

    if (req.openhab.status === 'offline') {
        res.writeHead(500, 'openHAB is offline', {
            'content-type': 'text/plain'
        });
        res.end('openHAB is offline');
        return;
    }
    
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

    if( (requestHeaders['content-length'] === '0') && (requestHeaders['content-type'] === undefined) )
    {
        requestHeaders['content-type'] = 'text/plain';
    }

    for(var i in req.headers)
    {
        this.logger.debug("Out: " + i + " -> " + req.headers[i]);
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

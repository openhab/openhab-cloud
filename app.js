/**
 * Copyright (c) 2014-2016 by the respective copyright holders.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 */

/**
 * This is the main application of the openHAB-cloud service
 *
 * @author Victor Belov - Initial contribution
 * @author Dan Cunningham - Extended Features
 * @author Mehmet Arziman - Extended Features
 *
 */

// TODO: Move all request handlers out of here, move authentication to auth.js

// Main Logging setup
var logger = require('./logger.js'),
    config = require('./config.json'),
    system = require('./system');

system.setConfiguration(config);

require('heapdump');

logger.info('openHAB-cloud: Backend service is starting up...');

process.on('uncaughtException', function (err) {
    logger.error(err);
});

logger.info('openHAB-cloud: Backend logging initialized...');

// Initialize the main configuration
var taskEnv = process.env.TASK || 'main';

// If Google Cloud Messaging is configured set it up
if (system.isGcmConfigured()) {
    require('./gcm-xmpp');
}

var registration_enabled = ('registration_enabled' in config) ? config.registration_enabled : true;

module.exports.config = config;

// Setup all routes
var flash = require('connect-flash'),
    express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    fs = require('fs'),
    passport = require('passport'),
    account_routes = require('./routes/account'),
    devices_routes = require('./routes/devices'),
    applications_routes = require('./routes/applications'),
    events_routes = require('./routes/events'),
    items_routes = require('./routes/items'),
    notifications_routes = require('./routes/notifications'),
    configsystem_routes = require('./routes/configsystem'),
    invitations_routes = require('./routes/invitations'),
    users_routes = require('./routes/users'),
    staff_routes = require('./routes/staff'),
    api_routes = require('./routes/api'),
    ifttt_routes = require('./routes/ifttt'),
    session = require('express-session'),
    RedisStore = require('connect-redis')(session),
    redis = require('./redis-helper'),
    moment = require('moment'),
    date_util = require('./date_util.js'),
    appleSender = require('./aps-helper'),
    oauth2 = require('./oauth2'),
    auth = require('./auth.js'),
    Limiter = require('ratelimiter'),
    MongoConnect = require('./system/mongoconnect');

// Setup Google Cloud Messaging component
var gcm = require('node-gcm');
var gcmSender = require('./gcmsender.js');

// MongoDB connection settings
var mongoose = require('mongoose');
var cacheOpts = {
    max: 5000,
    maxAge: 1000 * 60 * 10
};

require('mongoose-cache').install(mongoose, cacheOpts);

// Try to setup a mongodb connection, otherwise stopping
var mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);

var mongooseTypes = require('mongoose-types');
mongooseTypes.loadTypes(mongoose);

var app = express();

// A request counter for issuing a uniqe ID to every request when sending them to openHABs
var requestCounter = 0;

// A list of requests which are awaiting for responses from openHABs
var restRequests = {};

// A list of openHABs which lost their socket.io connection and are due for offline notification
// key is openHAB UUID, value is Date when openHAB was disconnected
var offlineOpenhabs = {};

/**
 * Callback for the 'check offline openHABs' scheduled task to notify the owner of an openHAB, that the instance
 * is offline.
 *
 * @param error The error, if an error occured
 * @param {Openhab} openhab The openHAB instance
 */
function notifyOpenHABOwnerOffline(error, openhab) {
    if (!openhab || error) {
        return;
    }
    openhab.status = 'offline';
    openhab.last_online = new Date();
    openhab.save(function (error) {
        if (error) {
            logger.error('openHAB-cloud: Error saving openHAB status: ' + error);
        }
    });
    var disconnectevent = new Event({
        openhab: openhab.id,
        source: 'openhab',
        status: 'offline',
        color: 'bad'
    });
    disconnectevent.save(function (error) {
        if (error) {
            logger.error('openHAB-cloud: Error saving disconnect event: ' + error);
        }
    });
    notifyOpenHABStatusChange(openhab, 'offline');
    delete offlineOpenhabs[openhab.uuid];
}

// This timer runs every minute and checks if there are any openHABs in offline status for more then 300 sec
// Then it sends notifications to openHAB's owner if it is offline for more then 300 sec
// This timer only runs on the main task
if (taskEnv === 'main') {
    setInterval(function () {
        logger.debug('openHAB-cloud: Checking for offline openHABs (' + Object.keys(offlineOpenhabs).length + ')');
        for (var offlineOpenhabUuid in offlineOpenhabs) {
            if (Date.now() - offlineOpenhabs[offlineOpenhabUuid] < 5 * 60 * 1000) {
                continue;
            }
            logger.debug('openHAB-cloud: openHAB with ' + offlineOpenhabUuid + ' is offline > 300 sec, time to notify the owner');
            Openhab.findOne({
                uuid: offlineOpenhabUuid
            }).cache().exec(notifyOpenHABOwnerOffline);
        }
    }, 60000);
}

//cancel restRequests that have become orphaned.  For some reason neither close
//nor finish is being called on some response objects and we end up hanging on
//to these in our restRequests map.  This goes through and finds those orphaned
//responses and cleans them up, otherwise memory goes through the roof.
setInterval(function () {
  logger.debug('openHAB-cloud: Checking orphaned rest requests (' + Object.keys(restRequests).length + ')');
  for (var requestId in restRequests) {
    var res = restRequests[requestId];
    if (res.finished) {
      logger.debug('openHAB-cloud: expiring orphaned response');
      delete restRequests[requestId];
      if(res.openhab) {
        io.sockets.in(res.openhab.uuid).emit('cancel', {
          id: requestId
        });
      }
    }
  }
}, 60000);

// Setup mongoose data models
var User = require('./models/user');
var Openhab = require('./models/openhab');
var OpenhabConfig = require('./models/openhabconfig');
var Event = require('./models/event');
var Item = require('./models/item');
var UserDevice = require('./models/userdevice');
var Notification = require('./models/notification');
var OpenhabAccessLog = require('./models/openhabaccesslog');

logger.info('openHAB-cloud: Scheduling a statistics job (every 5 min)');
var every5MinStatJob = require('./jobs/every5minstat');
every5MinStatJob.start();

// Create http server
var server = http.createServer(app);

// Configure the openHAB-cloud for development or productive mode
app.configure('development', function () {
    app.use(express.errorHandler());
});

app.configure('production', function () {});

// App configuration for all environments
app.configure(function () {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.favicon());
    if (config.system.logging && config.system.logging === 'debug')
        app.use(express.logger('dev'));
    
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser(config.express.key));
    
    // Configurable support for cross subdomain cookies
    var cookie = {};
    if(config.system.subDomainCookies){
        cookie.path = '/';
        cookie.domain = '.' + system.getHost();
        logger.info('openHAB-cloud: Cross sub domain cookie support is configured for domain: ' + cookie.domain);
    }
    app.use(express.session({
        secret: config.express.key,
        store: new RedisStore({
            host: 'localhost',
            port: 6379,
            client: redis,
            logErrors: true
        }),
        cookie: cookie
    }));
   
    app.use(flash());
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(function (req, res, next) {
        var csrf = express.csrf();
        // Check if url needs csrf
        if (!req.path.match('/rest*') && !req.path.match('/oauth2/token') && !req.path.match('/ifttt/*'))
            csrf(req, res, next);
        else
            next();
    });
    app.use(function (req, res, next) {
        if (typeof req.csrfToken === 'function') {
            res.locals.token = req.csrfToken();
        }
        next();
    });
    app.use(function (req, res, next) {
        if (req.user) {
            Openhab.findOne({
                account: req.user.account
            }).lean().exec(function (error, openhab) {
                res.locals.baseurl = system.getBaseURL();
                if (!error && openhab) {
                    res.locals.openhab = openhab;
                    res.locals.openhabstatus = openhab.status;
                    res.locals.openhablastonline = openhab.last_online;
                    if (openhab.openhabVersion !== undefined) {
                        res.locals.openhabMajorVersion = openhab.openhabVersion.split('.')[0];
                    } else {
                        res.locals.openhabMajorVersion = 0;
                    }
                } else {
                    res.locals.openhab = undefined;
                    res.locals.openhabstatus = undefined;
                    res.locals.openhablastonline = undefined;
                    res.locals.openhabMajorVersion = undefined;
                }
                next();
            });
        } else {
            next();
        }
    });

    // Add global usable locals for templates
    app.use(function (req, res, next) {
        if (req.session.timezone) {
            res.locals.timeZone = req.session.timezone;
        } else {
            res.locals.timeZone = 'undefined';
        }
        res.locals.moment = moment;
        res.locals.date_util = date_util;

        res.locals.legal = false;
        if (config.legal) {
            res.locals.legal = true;
            res.locals.terms = config.legal.terms;
            res.locals.policy = config.legal.policy;
        }
	    res.locals.registration_enabled = registration_enabled;
        next();
    });
    app.use(function (req, res, next) {
        var host = req.headers.host;
        //  console.log(host);
        if (!host) {
            next(); // No host in header, just go ahead
        }
        // If host matches names for full /* proxying, go ahead and just proxy it.
        if (host.indexOf('remote.') === 0 || host.indexOf('home.') === 0) {
            req.url = '/remote' + req.url;
        }
        next();
    });
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

server.listen(app.get('port'), function () {
    logger.info('openHAB-cloud: express server listening on port ' + app.get('port'));
});

var io = require('socket.io').listen(server, {
    logger: logger
});

// Ensure user is authenticated for web requests
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl || req.url;
    res.redirect('/login');
}

// Ensure user is authenticated for REST or proxied requets
function ensureRestAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    return passport.authenticate(['basic','bearer'], {session: false})(req, res, next);
}

// Ensure user have 'master' role for certain routes
function ensureMaster(req, res, next) {
    if (req.user.role === 'master') {
        return next();
    }
    res.redirect('/');
}

// Ensure user is from 'staff' group for certain routes
function ensureStaff(req, res, next) {
    if (req.user.group === 'staff') {
        return next();
    }
    res.redirect('/');
}

// General routes
app.get('/', routes.index);


// V2 route - response to this route means this openHAB-cloud is using v2 transport based on socket.io 1.0
app.get('/v2', routes.getv2);

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

app.get('/login', function (req, res) {
    errormessages = req.flash('error');
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

// My account
app.get('/account', ensureAuthenticated, account_routes.accountget);
app.post('/account', ensureAuthenticated, ensureMaster, account_routes.accountpostvalidate, account_routes.accountpost);
app.post('/accountpassword', ensureAuthenticated, account_routes.accountpasswordpostvalidate, account_routes.accountpasswordpost);
app.get('/accountdelete', ensureAuthenticated, ensureMaster, account_routes.accountdeleteget);
app.post('/accountdelete', ensureAuthenticated, ensureMaster, account_routes.accountdeletepost);
app.get('/itemsdelete', ensureAuthenticated, ensureMaster, account_routes.itemsdeleteget);
app.post('/itemsdelete', ensureAuthenticated, ensureMaster, account_routes.itemsdeletepost);

// My devices
app.get('/devices', ensureAuthenticated, devices_routes.devicesget);
app.get('/devices/:id', ensureAuthenticated, devices_routes.devicesget);
app.get('/devices/:id/delete', ensureAuthenticated, devices_routes.devicesdelete);
app.post('/devices/:id/sendmessage', ensureAuthenticated, devices_routes.devicessendmessagevalidate, devices_routes.devicessendmessage);

// Applications
app.get('/applications', ensureAuthenticated, applications_routes.applicationsget);
app.get('/applications/:id/delete', ensureAuthenticated, applications_routes.applicationsdelete);

// New user registration
if (!config.legal.terms && !config.legal.policy) {
    app.post('/register', account_routes.registerpostvalidate, account_routes.registerpost);
}
app.post('/register', account_routes.registerpostvalidateall, account_routes.registerpost);
app.get('/verify', account_routes.verifyget);

// Enroll for beta - old URLs, both of them respond with redirects to /login
app.get('/enroll', account_routes.enrollget);
app.post('/enroll', account_routes.enrollpost);

// Events
app.get('/events', ensureAuthenticated, events_routes.eventsget);

// Items
app.get('/items', ensureAuthenticated, items_routes.itemsget);

// Notifications
app.get('/notifications', ensureAuthenticated, notifications_routes.notificationsget);

// Invitations
app.get('/invitations', ensureAuthenticated, invitations_routes.invitationsget);
app.post('/invitations', ensureAuthenticated, invitations_routes.invitationspostvalidate, invitations_routes.invitationspost);
app.get('/lostpassword', account_routes.lostpasswordget);
app.post('/lostpassword', account_routes.lostpasswordpostvalidate, account_routes.lostpasswordpost);
app.get('/lostpasswordreset', account_routes.lostpasswordresetget);
app.post('/lostpasswordreset', account_routes.lostpasswordresetpostvalidate, account_routes.lostpasswordresetpost);

// Users management for 'master' users
app.get('/users', ensureAuthenticated, ensureMaster, users_routes.usersget);
app.get('/users/add', ensureAuthenticated, ensureMaster, users_routes.usersaddget);
app.post('/users/add', ensureAuthenticated, ensureMaster, users_routes.usersaddpostvalidate, users_routes.usersaddpost);
app.get('/users/delete/:id', ensureAuthenticated, ensureMaster, users_routes.usersdeleteget);
app.get('/users/:id', ensureAuthenticated, ensureMaster, users_routes.usersget);

// System Configuration
app.get('/config/system', ensureAuthenticated, configsystem_routes.get);
app.get('/config/system/:id', ensureAuthenticated, configsystem_routes.get);

// OAuth2 routes
app.get('/oauth2/authorize', ensureAuthenticated, oauth2.authorization);
app.post('/oauth2/authorize/decision', ensureAuthenticated, oauth2.decision);
app.post('/oauth2/token', oauth2.token);

// Staff route
app.get('/staff', ensureAuthenticated, ensureStaff, staff_routes.staffget);
app.get('/staff/processenroll/:id', ensureAuthenticated, ensureStaff, staff_routes.processenroll);
app.get('/staff/stats', ensureAuthenticated, ensureStaff, staff_routes.statsget);
app.get('/staff/invitations', ensureAuthenticated, ensureStaff, staff_routes.invitationsget);
app.get('/staff/resendinvitation/:id', ensureAuthenticated, ensureStaff, staff_routes.resendinvitation);
app.get('/staff/deleteinvitation/:id', ensureAuthenticated, ensureStaff, staff_routes.deleteinvitation);
app.get('/staff/oauthclients', ensureAuthenticated, ensureStaff, staff_routes.oauthclientsget);


// IFTTT routes
if (config.ifttt) {
    logger.info('openHAB-cloud: IFTTT is configured, app handling IFTTT capabilities...');
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
}

// A route to set session timezone automatically detected in browser
app.all('/setTimezone', setSessionTimezone);

function setSessionTimezone(req, res) {
    req.session.timezone = req.query['tz'];
    res.send(200, 'Timezone set');
}

// REST routes
app.get('/api/events', ensureAuthenticated, events_routes.eventsvaluesget);

function setOpenhab(req, res, next) {
    req.user.openhab(function (error, openhab) {
        if (!error && openhab) {
            req.openhab = openhab;
            next();
            return;
        }
        if (error) {
            logger.error('openHAB-cloud: openHAB lookup error: ' + error);
            return res.status(500).json({
                errors: [{
                    message: error
                }]
            });
        } else {
            logger.warn('openHAB-cloud: Can\'t find the openHAB of user which is unbelievable');
            return res.status(500).json({
                errors: [{
                    message: 'openHAB not found'
                }]
            });
        }
    });
}

function preassembleBody(req, res, next) {
    var data = '';
    req.on('data', function (chunk) {
        data += chunk;
    });
    req.on('end', function () {
        req.rawBody = data;
        next();
    });
}

function proxyRouteOpenhab(req, res) {
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
    requestCounter++;
    var requestId = requestCounter;
    // make a local copy of request headers to modify
    var requestHeaders = req.headers;
    // get remote hose from either x-forwarded-for or request
    var remoteHost = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
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
    io.sockets.in(req.openhab.uuid).emit('request', {
        id: requestId,
        method: req.method,
        headers: requestHeaders,
        path: requestPath,
        query: req.query,
        body: req.rawBody
    });
    res.openhab = req.openhab;
    restRequests[requestId] = res;

    //we should only have to catch these two callbacks to hear about the response
    //being close/finished, but thats not the case. Sometimes neither gets called
    //and we have to manually clean up.  We have a interval for this above.

    //when a response is closed by the requester
    res.on('close', function () {
        io.sockets.in(req.openhab.uuid).emit('cancel', {
            id: requestId
        });
        delete restRequests[requestId];
    });

    //when a response is closed by us
    res.on('finish', function () {
        delete restRequests[requestId];
    });

}

function addAppleRegistration(req, res) {
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
            logger.warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }
        if (userDevice) {
            // If found, update device token and save
            logger.info('openHAB-cloud: Found iOS device for user ' + req.user.username + ', updating');
            userDevice.iosDeviceToken = registrationId;
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, add new device registration
            logger.info('openHAB-cloud: Registering new iOS device for user ' + req.user.username);
            var userDevice = new UserDevice({
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
                    logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Added');
        }
    });

}

/**
 * Tries to find an android device using the registration ID and sets the given deviceId to this UserDevice.
 *
 * @param req
 * @param registrationId
 * @param res
 * @param deviceId
 * @param deviceModel
 */
function findAndroidDeviceByRegistrationId(req, registrationId, res, deviceId, deviceModel) {
    UserDevice.findOne({
            owner: req.user.id,
            deviceType: 'android',
            androidRegistration: registrationId
        },
        function (error, userDevice) {
            if (error) {
                logger.warn('openHAB-cloud: Error looking up device: ' + error);
                res.send(500, 'Internal server error');
                return;
            }
            if (userDevice) {
                // If found, update the changed device id
                userDevice.deviceId = deviceId;
                userDevice.lastUpdate = new Date();
                userDevice.save(function (error) {
                    if (error) {
                        logger.error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Updated');
            } else {
                // If not found, finally register a new one
                var userDevice = new UserDevice({
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
                        logger.error('openHAB-cloud: Error saving user device: ' + error);
                    }
                });
                res.send(200, 'Added');
            }
        });
}
function addAndroidRegistration(req, res) {
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
            logger.warn('openHAB-cloud: Error looking up device: ' + error);
            res.send(500, 'Internal server error');
            return;
        }

        if (userDevice) {
            // If found, update the changed registration id
            logger.info('openHAB-cloud: Found an Android device for user ' + req.user.username + ', updating');
            userDevice.androidRegistration = registrationId;
            userDevice.lastUpdate = new Date();
            userDevice.save(function (error) {
                if (error) {
                    logger.error('openHAB-cloud: Error saving user device: ' + error);
                }
            });
            res.send(200, 'Updated');
        } else {
            // If not found, try to find device by registration id. Sometimes android devices change their
            // ids dynamically, while google play services continue to return the same registration id
            // so this is still the same device and we don't want any duplicates
            findAndroidDeviceByRegistrationId(req, registrationId, res, deviceId, deviceModel);
        }
    });
}

// Process all requests from mobile apps to openHAB
app.all('/rest*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/images/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/static/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/rrdchart.png*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/chart*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/openhab.app*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/WebApp*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/CMD*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/cometVisu*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/proxy*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/greent*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/jquery.*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/classicui/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/paperui/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/basicui/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/doc/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/start/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/icon*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/habmin/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/remote*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/habpanel/*', ensureRestAuthenticated, preassembleBody, setOpenhab, proxyRouteOpenhab);

// myOH API for mobile apps
app.all('/api/v1/notifications*', ensureRestAuthenticated, preassembleBody, setOpenhab, api_routes.notificationsget);
app.all('/api/v1/settings/notifications', ensureRestAuthenticated, preassembleBody, setOpenhab, api_routes.notificationssettingsget);

// Android app registration
app.all('/addAndroidRegistration*', ensureRestAuthenticated, preassembleBody, setOpenhab, addAndroidRegistration);
app.all('/addAppleRegistration*', ensureRestAuthenticated, preassembleBody, setOpenhab, addAppleRegistration);

function sendNotificationToUser(user, message, icon, severity) {
    var androidRegistrations = [];
    var iosDeviceTokens = [];
    newNotification = new Notification({
        user: user.id,
        message: message,
        icon: icon,
        severity: severity
    });
    newNotification.save(function (error) {
        if (error) {
            logger.error('openHAB-cloud: Error saving notification: ' + error);
        }
    });
    UserDevice.find({
        owner: user.id
    }, function (error, userDevices) {
        if (error) {
            logger.warn('openHAB-cloud: Error fetching devices for user: ' + error);
            return;
        }
        if (!userDevices) {
            // User don't have any registered devices, so we will skip it.
            return;
        }

        for (var i = 0; i < userDevices.length; i++) {
            if (userDevices[i].deviceType === 'android') {
                androidRegistrations.push(userDevices[i].androidRegistration);
            } else if (userDevices[i].deviceType === 'ios') {
                iosDeviceTokens.push(userDevices[i].iosDeviceToken);
            }
        }
        // If we found any android devices, send notification
        if (androidRegistrations.length > 0) {
            sendAndroidNotifications(androidRegistrations, message);
        }
        // If we found any ios devices, send notification
        if (iosDeviceTokens.length > 0) {
            sendIosNotifications(iosDeviceTokens, message);
        }
    });
}

function sendIosNotifications(iosDeviceTokens, message) {
    for (var i = 0; i < iosDeviceTokens.length; i++) {
        if (config.apn) {
            appleSender.sendAppleNotification(iosDeviceTokens[i], message);
        }
    }
}

function sendAndroidNotifications(registrationIds, message) {
    redis.incr('androidNotificationId', function (error, androidNotificationId) {
        if (!config.gcm || error) {
            return;
        }
        var gcmMessage = new gcm.Message({
            delayWhileIdle: false,
            data: {
                type: 'notification',
                notificationId: androidNotificationId,
                message: message
            }
        });
        gcmSender.send(gcmMessage, registrationIds, 4, function (err, result) {
            if (err) {
                logger.error('openHAB-cloud: GCM send error: ' + err);
            }
        });
    });
}

// In case of polling transport set poll duration to 300 seconds
io.set('polling duration', 300);

io.use(function (socket, next) {
    var handshakeData = socket.handshake;
    logger.info('openHAB-cloud: Authorizing incoming openHAB connection');
    handshakeData.uuid = handshakeData.query['uuid'];
    handshakeData.openhabVersion = handshakeData.query['openhabversion'];
    handshakeData.clientVersion = handshakeData.query['clientVersion'];
    handshakeSecret = handshakeData.query['secret'];
    if (!handshakeData.uuid) {
        handshakeData.uuid = handshakeData.headers['uuid'];
        handshakeSecret = handshakeData.headers['secret'];
        handshakeData.openhabVersion = handshakeData.headers['openhabversion'];
        handshakeData.clientVersion = handshakeData.headers['clientVersion'];
    }
    if (!handshakeData.openhabVersion) {
        handshakeData.openhabVersion = 'unknown';
    }
    if (!handshakeData.clientVersion) {
        handshakeData.clientVersion = 'unknown';
    }
    Openhab.findOne({
        uuid: handshakeData.uuid,
        secret: handshakeSecret
    }, function (error, openhab) {
        if (error) {
            logger.error('openHAB-cloud: openHAB lookup error: ' + error);
            next(error);
        } else {
            if (openhab) {
                next();
            } else {
                logger.info('openHAB-cloud: openHAB ' + handshakeData.uuid + ' not found');
                next(new Error('not authorized'));
            }
        }
    });
});

io.sockets.on('connection', function (socket) {
    logger.info('openHAB-cloud: Incoming openHAB connection for uuid ' + socket.handshake.uuid);
    socket.join(socket.handshake.uuid);
    // Remove openHAB from offline array if needed
    delete offlineOpenhabs[socket.handshake.uuid];
    Openhab.findOne({
        uuid: socket.handshake.uuid
    }, function (error, openhab) {
        if (!error && openhab) {
            logger.info('openHAB-cloud: Connected openHAB with ' + socket.handshake.uuid + ' successfully');
            // Make an openhabaccesslog entry anyway
            var remoteHost = socket.handshake.headers['x-forwarded-for'] || socket.client.conn.remoteAddress;
            var newOpenhabAccessLog = new OpenhabAccessLog({
                openhab: openhab.id,
                remoteHost: remoteHost,
                remoteVersion: socket.handshake.openhabVersion,
                remoteClientVersion: socket.handshake.clientVersion
            });
            newOpenhabAccessLog.save(function (error) {
                if (error) {
                    logger.error('openHAB-cloud: Error saving openHAB access log: ' + error);
                }
            });
            // Make an event and notification only if openhab was offline
            // If it was marked online, means reconnect appeared because of my.oh fault
            // We don't want massive events and notifications when node is restarted
            if (openhab.status === 'offline') {
                openhab.status = 'online';
                openhab.last_online = new Date();
                openhab.openhabVersion = socket.handshake.openhabVersion;
                openhab.clientVersion = socket.handshake.clientVersion;
                openhab.save(function (error) {
                    if (error) {
                        logger.error('openHAB-cloud: Error saving openHAB: ' + error);
                    }
                });
                var connectevent = new Event({
                    openhab: openhab.id,
                    source: 'openhab',
                    status: 'online',
                    color: 'good'
                });
                connectevent.save(function (error) {
                    if (error) {
                        logger.error('openHAB-cloud: Error saving connect event: ' + error);
                    }
                });
                notifyOpenHABStatusChange(openhab, 'online');
            } else {
                openhab.openhabVersion = socket.handshake.openhabVersion;
                openhab.clientVersion = socket.handshake.clientVersion;
                openhab.save(function (error) {
                    if (error) {
                        logger.error('openHAB-cloud: Error saving openhab: ' + error);
                    }
                });
            }
            socket.openhabUuid = openhab.uuid;
            socket.openhabId = openhab.id;
        } else {
            if (error) {
                logger.error('openHAB-cloud: Error looking up openHAB: ' + error);
            } else {
                logger.warn('openHAB-cloud: Unable to find openHAB ' + socket.handshake.uuid);
            }
        }
    });

    /*
    on('response') is a method for old versions of openHAB-cloud bundle which served the whole response as a single
    chunk, while on('responseHeader|responseContent|responseFinished') is for newer versions which send response
    in chunks in an async way enabling streaming responses.
    Every handler checks if request exists, if not - sends cancel signal to openhab to eliminate abusive
    data exchange in case openhab somehow missed previous cancel, then checks if request belongs to openHAB
    which sent response to this request id.
    */

    socket.on('response', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid) {
                // self.to(self.handshake.uuid).emit('response', data);
                if (data.error !== null) {
                    restRequests[requestId].send(500, 'Timeout in transit');
                } else {
                    if (data.headers['Content-Type'] !== null) {
                        var contentType = data.headers['Content-Type'];
                        restRequests[requestId].contentType(contentType);
                    }
                    restRequests[requestId].send(data.responseStatusCode, new Buffer(data.body, 'base64'));
                }
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        } else {
            self.emit('cancel', {
                id: requestId
            });
        }
    });
    socket.on('responseHeader', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid && !restRequests[requestId].headersSent) {
                restRequests[requestId].writeHead(data.responseStatusCode, data.responseStatusText, data.headers);
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        } else {
            self.emit('cancel', {
                id: requestId
            });
        }
    });
    // This is a method for old versions of openHAB-cloud bundle which use base64 encoding for binary
    socket.on('responseContent', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid) {
                restRequests[requestId].write(new Buffer(data.body, 'base64'));
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        } else {
            self.emit('cancel', {
                id: requestId
            });
        }
    });
    // This is a method for new versions of openHAB-cloud bundle which use bindary encoding
    socket.on('responseContentBinary', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid) {
                restRequests[requestId].write(data.body);
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        } else {
            self.emit('cancel', {
                id: requestId
            });
        }
    });
    socket.on('responseFinished', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid) {
                // self.to(self.handshake.uuid).emit('responseFinished', data);
                restRequests[requestId].end();
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        }
    });
    socket.on('responseError', function (data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId]) {
            if (self.handshake.uuid === restRequests[requestId].openhab.uuid) {
                // self.to(self.handshake.uuid).emit('responseError', data);
                restRequests[requestId].send(500, data.responseStatusText);
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        }
    });
    socket.on('notification', function (data) {
        var self = this;
        logger.info('openHAB-cloud: Notification request from ' + self.handshake.uuid + ' to user ' + data.userId);
        User.findOne({
            username: data.userId
        }, function (error, user) {
            if (error) {
                logger.error('openHAB-cloud: User lookup error: ' + error);
                return;
            }
            if (!user) {
                return;
            }
            user.openhab(function (error, openhab) {
                if (!error && openhab) {
                    if (openhab.uuid === self.handshake.uuid) {
                        logger.info('openHAB-cloud: Notification from ' + self.handshake.uuid + ' to ' + user.username);
                        sendNotificationToUser(user, data.message, data.icon, data.severity);
                    } else {
                        logger.warn('openHAB-cloud: oopenHAB ' + self.handshake.uuid + ' requested notification for user (' + user.username + ') which it does not belong to');
                    }
                } else {
                    if (error) {
                        logger.error('openHAB-cloud: openHAB lookup error: ' + error);
                    } else {
                        logger.warn('openHAB-cloud: Unable to find openHAB for user ' + user.username);
                    }
                }
            });
        });
    });

    socket.on('broadcastnotification', function (data) {
        var self = this;
        Openhab.findById(self.openhabId, function (error, openhab) {
            if (error) {
                logger.error('openHAB-cloud: openHAB lookup error: ' + error);
                return;
            }
            if (!openhab) {
                logger.debug('openHAB-cloud: openHAB not found');
            }

            User.find({
                account: openhab.account
            }, function (error, users) {
                if (!error && users) {
                    for (var i = 0; i < users.length; i++) {
                        sendNotificationToUser(users[i], data.message, data.icon, data.severity);
                    }
                } else {
                    if (error) {
                        logger.error('openHAB-cloud: Error getting users list: ' + error);
                    } else {
                        logger.debug('openHAB-cloud: No users found for openHAB');
                    }
                }
            });
        });
    });

    socket.on('lognotification', function (data) {
        var self = this;
        Openhab.findById(self.openhabId, function (error, openhab) {
            if (error) {
                logger.error('openHAB lookup error: ' + error);
            }
            if (!openhab) {
                logger.debug('openHAB not found');
            }
            User.find({
                account: openhab.account
            }, function (error, users) {
                if (!error && users) {
                    for (var i = 0; i < users.length; i++) {
                        newNotification = new Notification({
                            user: users[i].id,
                            message: data.message,
                            icon: data.icon,
                            severity: data.severity
                        });
                        newNotification.save(function (error) {
                            if (error) {
                                logger.error('Error saving notification: ' + error);
                            }
                        });
                    }
                } else {
                    if (error) {
                        logger.error('Error getting users list: ' + error);
                    } else {
                        logger.debug('No users found for openhab');
                    }
                }
            });
        });
    });

    socket.on('itemupdate', function (data) {
        var self = this;
        //if openhabId is missing then user has not completed auth
        if (self.openhabId === undefined) {
            return;
        }
        var limiter = new Limiter({
            id: self.openhabId,
            db: redis,
            max: 20,
            duration: 60000
        });
        limiter.get(function (err, limit) {
            if (err) {
                logger.error('openHAB-cloud: Rate limit error ' + err);
                return;
            }
            if (!limit.remaining) {
                return;
            }
            var itemName = data.itemName;
            var itemStatus = data.itemStatus;
            // Find openhab
            if (itemStatus && itemStatus.length > 100) {
                logger.info('openHAB-cloud: Item ' + itemName + ' status.length (' + (itemStatus ? itemStatus.length : 'null') + ') is too big or null, ignoring update');
                return;
            }
            Openhab.findById(self.openhabId).cache().exec(function (error, openhab) {
                if (error) {
                    logger.warn('openHAB-cloud: Unable to find openHAB for itemUpdate: ' + error);
                    return;
                }
                if (!openhab) {
                    logger.info('openHAB-cloud: Unable to find openHAB for itemUpdate: openHAB doesn\'t exist');
                    return;
                }
                // Find the item (which should belong to this openhab)
                Item.findOne({
                    openhab: openhab.id,
                    name: itemName
                }).cache().exec(function (error, itemToUpdate) {
                    if (error) {
                        logger.warn('openHAB-cloud: Unable to find item for itemUpdate: ' + error);
                    }

                    // If no item found for this openhab with this name, create a new one
                    if (!itemToUpdate) {
                        logger.info('openHAB-cloud: Item ' + itemName + ' for openHAB ' + openhab.uuid + ' not found, creating new one');
                        itemToUpdate = new Item({
                            openhab: openhab.id,
                            name: itemName,
                            last_change: new Date,
                            status: ''
                        });
                    }
                    // If item status changed, update item and create new item status change event
                    if (itemToUpdate.status !== itemStatus) {
                        // Update previous status value
                        itemToUpdate.prev_status = itemToUpdate.status;
                        // Set new status value
                        itemToUpdate.status = itemStatus;
                        // Set last update timestamp to current time
                        itemToUpdate.last_update = new Date;
                        // Save the updated item
                        itemToUpdate.save(function (error) {
                            if (error) {
                                logger.error('openHAB-cloud: Error saving item: ' + error);
                            }
                        });
                        // Check if the new state is int or float to store it to Number and create new item update event
                        if (!isNaN(parseFloat(itemStatus))) {
                            // This is silly, but we need to check if previous status was int or float
                            if (!isNaN(parseFloat(itemToUpdate.prev_status))) {
                                Event.collection.insert({
                                    openhab: mongoose.Types.ObjectId(openhab.id),
                                    source: itemName,
                                    status: itemStatus,
                                    oldStatus: itemToUpdate.prev_status,
                                    numericStatus: parseFloat(itemStatus),
                                    oldNumericStatus: parseFloat(itemToUpdate.prev_status),
                                    color: 'info',
                                    when: new Date
                                }, function (error) {
                                    if (error) {
                                        logger.error('openHAB-cloud: Error saving event: ' + error);
                                    }
                                });
                            } else {
                                Event.collection.insert({
                                    openhab: mongoose.Types.ObjectId(openhab.id),
                                    source: itemName,
                                    status: itemStatus,
                                    oldStatus: itemToUpdate.prev_status,
                                    numericStatus: parseFloat(itemStatus),
                                    color: 'info',
                                    when: new Date
                                }, function (error) {
                                    if (error) {
                                        logger.error('openHAB-cloud: Error saving event: ' + error);
                                    }
                                });
                            }
                        } else {
                            Event.collection.insert({
                                openhab: mongoose.Types.ObjectId(openhab.id),
                                source: itemName,
                                status: itemStatus,
                                oldStatus: itemToUpdate.prev_status,
                                color: 'info',
                                when: new Date
                            }, function (error) {
                                if (error) {
                                    logger.error('openHAB-cloud: Error saving event: ' + error);
                                }
                            });
                        }
                        // Thus if item status didn't change, there will be no event...
                    }
                });
            });
        });
    });

    socket.on('updateConfig', function (data) {
        var self = this;
        Openhab.findOne({
            uuid: self.handshake.uuid
        }, function (error, openhab) {
            if (error) {
                logger.warn(error);
                return;
            }
            if (!openhab) {
                logger.warn('openHAB-cloud: Unable to find openhab ' + self.handshake.uuid);
                return;
            }
            logger.info('openHAB-cloud: openHAB ' + self.handshake.uuid + ' requested to update ' + data.type + ' config ' +
                data.name + ' with timestamp = ' + data.timestamp);
            OpenhabConfig.findOne({
                    openhab: openhab.id,
                    type: data.type,
                    name: data.name
                },
                function (error, openhabConfig) {
                    if (error) {
                        logger.warn('openHAB-cloud: Failed to find ' + self.openhab.uuid + ' config: ' + error);
                        return;
                    }
                    if (!openhabConfig) {
                        logger.info('openHAB-cloud: No config found, creating new one');
                        openhabConfig = new OpenhabConfig({
                            type: data.type,
                            name: data.name,
                            timestamp: new Date(data.timestamp),
                            config: data.config,
                            openhab: openhab.id
                        });
                        openhabConfig.markModified();
                        openhabConfig.save(function (error) {
                            if (error !== null) {
                                logger.warn('openHAB-cloud: Error saving new openhab config: ' + error);
                            }
                        });
                    } else {
                        logger.info('openHAB-cloud: My timestamp = ' + openhabConfig.timestamp + ', remote timestamp = ' +
                            new Date(data.timestamp));
                        if (openhabConfig.timestamp > new Date(data.timestamp)) {
                            logger.info('openHAB-cloud: My config is newer');
                            io.sockets.in(openhab.uuid).emit('updateConfig', {
                                timestamp: openhabConfig.timestamp,
                                name: openhabConfig.name,
                                type: openhabConfig.type,
                                config: openhabConfig.config
                            });
                        } else {
                            if (openhabConfig.timestamp < new Date(data.timestamp)) {
                                logger.info('openHAB-cloud: Remote config is newer, updating');
                                openhabConfig.config = data.config;
                                openhabConfig.timestamp = new Date(data.timestamp);
                                openhabConfig.markModified();
                                openhabConfig.save();
                                io.sockets.in(openhab.uuid).emit('updateConfig', {
                                    timestamp: openhabConfig.timestamp,
                                    config: openhabConfig.config
                                });
                            } else {
                                logger.info('openHAB-cloud: My config = remote config');
                                io.sockets.in(openhab.uuid).emit('updateConfig', {
                                    timestamp: openhabConfig.timestamp,
                                    config: openhabConfig.config
                                });
                            }
                        }
                    }
                });
        });
    });

    socket.on('disconnect', function () {
        var self = this;
        // Find any other sockets for this openHAB and if any, don't mark openHAB as offline
        for (var connectedSocketId in io.sockets.connected) {
            var connectedSocket = io.sockets.connected[connectedSocketId];
            if (connectedSocket !== self && connectedSocket.openhabUuid === self.handshake.uuid) {
                logger.info('openHAB-cloud: Found another connected socket for ' + self.handshake.uuid + ', will not mark offline');
                return;
            }
        }
        Openhab.findById(self.openhabId, function (error, openhab) {
            if (!error && openhab) {
                offlineOpenhabs[openhab.uuid] = Date.now();
                logger.info('openHAB-cloud: Disconnected ' + openhab.uuid);
            }
        });
    });
});

function notifyOpenHABStatusChange(openhab, status) {
    User.find({
        account: openhab.account,
        role: 'master'
    }, function (error, users) {
        if (!error && users) {
            for (var i = 0; i < users.length; i++) {
                if (status === 'online') {
                    sendNotificationToUser(users[i], 'openHAB is online', 'openhab', 'good');
                } else {
                    sendNotificationToUser(users[i], 'openHAB is offline', 'openhab', 'bad');
                }
            }
        } else {
            if (error) {
                logger.warn('openHAB-cloud: Error finding users to notify: ' + error);
            } else {
                logger.warn('openHAB-cloud: Unable to find any masters for openHAB ' + openhab.uuid);
            }
        }
    });
}

function shutdown() {
    // TODO: save current request id?
    logger.info('openHAB-cloud: Stopping every5min statistics job');
    every5MinStatJob.stop();

    logger.info('openHAB-cloud: Safe shutdown complete');
    process.exit();
}

process.on('SIGINT', function () {
    logger.info('openHAB-cloud frontend is shutting down from SIGINT');
    shutdown();
});

process.on('SIGTERM', function () {
    logger.info('openHAB-cloud frontend is shutting down from SIGTERM');
    shutdown();
});

module.exports.sio = io;

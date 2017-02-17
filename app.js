
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
var logger = require('./logger.js');

logger.info('openHAB-cloud: Backend service is starting up...');

process.on('uncaughtException', function(err){
    logger.error(err);
});

logger.info('openHAB-cloud: Backend logging initialized...');

// Initialize the main configuration
var taskEnv = process.env.TASK || 'main';
var config = require('./config.json');

// If Google Cloud Messaging is configured set it up
if(config.gcm) {
  var gcmXmpp = require('./gcm-xmpp');
}

module.exports.config = config;

// Setup all routes
var flash = require('connect-flash')
    , express = require('express')
    , routes = require('./routes')
    , user = require('./routes/user')
    , http = require('http')
    , path = require('path')
    , fs = require("fs")
    , passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , account_routes = require('./routes/account')
    , devices_routes = require('./routes/devices')
    , applications_routes = require('./routes/applications')
    , events_routes = require('./routes/events')
    , items_routes = require('./routes/items')
    , notifications_routes = require('./routes/notifications')
    , configsystem_routes = require('./routes/configsystem')
    , invitations_routes = require('./routes/invitations')
    , users_routes = require('./routes/users')
    , staff_routes = require('./routes/staff')
    , api_routes = require('./routes/api')
    , ifttt_routes = require('./routes/ifttt')
    , session = require('express-session')
    , RedisStore = require('connect-redis')(session)
    , redis = require('./redis-helper')
    , moment = require('moment')
    , date_util = require('./date_util.js')
    , cronJob = require('cron').CronJob
    , appleSender = require('./aps-helper')
    , oauth2 = require('./oauth2')
    , Limiter = require('ratelimiter');


// Setup Google Cloud Messaging component
var gcm = require('node-gcm');
var gcmSender = require('./gcmsender.js');

var form = require('express-form'),
    field = form.field;

// MongoDB connection settings
var mongoose = require('mongoose');
var cacheOpts = {
    max:5000,
    maxAge:1000*60*10
};

var ObjectId = mongoose.SchemaTypes.ObjectId;

require('mongoose-cache').install(mongoose, cacheOpts);

var mongoUri = 'mongodb://' +
((config.mongodb.user && config.mongodb.user.length > 0) ?
  config.mongodb.user + ':' + config.mongodb.password + '@' : "");

for (host in config.mongodb.hosts) {
    mongoUri += config.mongodb.hosts[host];
    if (host < config.mongodb.hosts.length - 1) {
        mongoUri += ",";
    }
}

mongoUri += "/" + config.mongodb.db + '?poolSize=100';
var mongoOptions = {
    replset: { poolSize: 100 },
    db: {safe: false}
};

// Try to setup a mongodb connection, otherwise stopping
logger.info("opneHAB-cloud: Trying to connect to mongodb at: " + mongoUri);
mongoose.connect(mongoUri, function(err) {
    if (err) {
        logger.error("openHAB-cloud: Error while connecting from openHAB-cloud to mongodb: " + err);
        logger.error("openHAB-cloud: Stopping openHAB-cloud due to error with mongodb");
        process.exit(1);
    } else {
        logger.info("openHAB-cloud: Successfully connected to mongodb");
    }
});

var mongooseTypes = require("mongoose-types");
mongooseTypes.loadTypes(mongoose);

var app = express();

// A request counter for issuing a uniqe ID to every request when sending them to openHABs
var requestCounter = 0;

// A list of requests which are awaiting for responses from openHABs
var restRequests = {};

// A list of openHABs which lost their socket.io connection and are due for offline notification
// key is openHAB UUID, value is Date when openHAB was disconnected
var offlineOpenhabs = {};

// This timer runs every minute and checks if there are any openHABs in offline status for more then 300 sec
// Then it sends notifications to openHAB's owner if it is offline for more then 300 sec
// This timer only runs on the main task

if (taskEnv == 'main') {
    setInterval(function () {
        logger.debug("openHAB-cloud: Checking for offline openHABs (" + Object.keys(offlineOpenhabs).length + ")");
        for (var offlineOpenhabUuid in offlineOpenhabs) {
        	// logger.debug(Date.now() - offlineOpenhabs[offlineOpenhabUuid]);
            if (Date.now() - offlineOpenhabs[offlineOpenhabUuid] > 5 * 60 * 1000) {
                logger.debug("openHAB-cloud: openHAB with "+offlineOpenhabUuid + " is offline > 300 sec, time to notify the owner");
                Openhab.findOne({uuid: offlineOpenhabUuid}).cache().exec(function (error, openhab) {
                    if (openhab && !error) {
                        openhab.status = 'offline';
                        openhab.last_online = new Date;
                        openhab.save(function (error) {
                            if (error) {
                                logger.error("openHAB-cloud: Error saving openHAB status: " + error);
                            }
                        });
                        var disconnectevent = new Event({
                            openhab: openhab.id,
                            source: "openhab",
                            status: "offline",
                            color: "bad"
                        });
                        disconnectevent.save(function (error) {
                            if (error) {
                                logger.error("openHAB-cloud: Error saving disconnect event: " + error);
                            }
                        });
                        notifyOpenHABStatusChange(openhab, "offline")
                        delete offlineOpenhabs[openhab.uuid];
                    }
                });
            }
        }
    }, 60000);
}

// Setup mongoose data models
var User = require('./models/user');
var Openhab = require('./models/openhab');
var OpenhabConfig = require('./models/openhabconfig');
var Event = require('./models/event');
var Item = require('./models/item');
var UserDevice = require('./models/userdevice');
var UserAccount = require('./models/useraccount');
var Notification = require('./models/notification');
var AccessLog = require('./models/accesslog');
var OpenhabAccessLog = require('./models/openhabaccesslog');
var Invitation = require('./models/invitation');
var Myohstat = require('./models/myohstat');

logger.info("openHAB-cloud: Scheduling a statistics job (every 5 min)");
var every5MinStatJob = require('./jobs/every5minstat');
every5MinStatJob.start();


// Create http server
var server = http.createServer(app);


// Local authentication strategy for passportjs
passport.use(new LocalStrategy({
    usernameField: 'username'},
    function(username, password, done){
        User.authenticate(username, password, function(err, user, params) {
        	// console.log(params);
            return done(err, user, params);
        });
    }));

passport.serializeUser(function(user, done) {
    done(null, user._id);
});

passport.deserializeUser(function(id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

// Configure the openHAB-cloud for development or productive mode
app.configure('development', function() {
    app.use(express.errorHandler());
});

app.configure('production', function() {
});

// App configuration for all environments
app.configure(function(){
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.favicon());
    if (config.system.logging && config.system.logging == "debug")
        app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser(config.express.key));
    app.use(express.session({
        secret: config.express.key,
        store: new RedisStore({ host: 'localhost', port: 6379, client: redis, logErrors:true })
    }));
    app.use(flash());
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(function(req, res, next) {
        var csrf = express.csrf();
        // Check if url needs csrf
        if (!req.path.match('/rest*') && !req.path.match('/oauth2/token') && !req.path.match('/ifttt/*'))
            csrf(req, res, next);
        else
            next();
    });
    app.use(function(req, res, next){
        if(typeof req.csrfToken === 'function') {
            res.locals.token = req.csrfToken();
        }
        next();
    });
    app.use(function(req, res, next) {
        if (req.user) {
            Openhab.findOne({account: req.user.account}).lean().exec(function(error, openhab) {
                if (!error && openhab) {
                    res.locals.openhab = openhab;
                    res.locals.openhabstatus = openhab.status;
                    res.locals.openhablastonline = openhab.last_online;
                    if (openhab.openhabVersion != undefined) {
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
    app.use(function(req, res, next) {
        if (req.session.timezone) {
            res.locals.timeZone = req.session.timezone;
        } else {
            res.locals.timeZone = 'undefined';
        }
        res.locals.moment = moment;
        res.locals.date_util = date_util;

        res.locals.legal = false;
        if(config.legal){
        	res.locals.legal = true;
        	res.locals.terms = config.legal.terms;
        	res.locals.policy = config.legal.policy;
        }
        next();
    });
    app.use(function(req, res, next) {
        var host = req.headers.host;
        //  console.log(host);
        if (!host) {
            next(); // No host in header, just go ahead
        }
        // If host matches names for full /* proxying, go ahead and just proxy it.
        if (host.indexOf('remote.') == 0 || host.indexOf('home.') == 0) {
            // app.all('/rest/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
        	//  console.log('vhost detected');
            req.url = '/remote' + req.url;
        }
        next();
    });
    app.use(app.router);
    //  app.use(require('less-middleware')({ src: __dirname + '/public' }));
    app.use(express.static(path.join(__dirname, 'public')));
});

server.listen(app.get('port'), function(){
    logger.info('openHAB-cloud: express server listening on port ' + app.get('port'));
});

var io = require('socket.io').listen(server, {logger : logger});
// var ioredis = require('socket.io-redis');
// io.adapter(ioredis({ host: 'localhost', port: 6379 }));

// Ensure user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl || req.url;
    res.redirect('/login')
}

// Ensure user have 'master' role for certain routes
function ensureMaster(req, res, next) {
    if (req.user.role == 'master') {
        return next();
    }
    res.redirect('/');
}

// Ensure user is from 'staff' group for certain routes
function ensureStaff(req, res, next) {
    if (req.user.group == 'staff') {
        return next();
    }
    res.redirect('/');
}

// General routes
app.get('/', routes.index);


// V2 route - response to this route means this openHAB-cloud is using v2 transport based on socket.io 1.0
app.get('/v2', routes.getv2);

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
});

app.get('/login', function(req, res) {
    errormessages = req.flash('error');
    if (req.query['invitationCode'] != null) {
        invitationCode = req.query['invitationCode'];
    } else {
        invitationCode = "";
    }
    // console.log(errormessages);
    // console.log(errormessages.length);
    res.render('login', {title: "Log in", user: req.user, errormessages: errormessages,
        infomessages: req.flash('info'), invitationCode: invitationCode});
});

app.post('/login', passport.authenticate('local', { successReturnToOrRedirect: '/',
    failureRedirect: '/login', failureFlash: true }));

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
if(!config.legal.terms && !config.legal.policy){
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
if(config.ifttt){
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
    // console.log("Timezone set to " + req.session.timezone);
    res.send(200, "Timezone set");
}

// REST routes
app.get('/api/events', ensureAuthenticated, events_routes.eventsvaluesget);

// Functions to process proxy requests to openHABs

// If the request contains a bearer token then do oauth2, otherwise try basic auth
var restAuth = function (req, res, next) {
    if (req.headers['authorization'] && req.headers['authorization'].indexOf('Bearer') == 0) {
        passport.authenticate('bearer', {
            session: false
        }, function (error, user, info) {
            if (error) {
                return res.status(401).json({
                    errors: [{
                        message: error
                    }]
                });
            }
            if (!user) {
                return res.status(401).json({
                    errors: [{
                        message: "Authentication failed"
                    }]
                });
            }
            req.logIn(user, function (error) {
                if (error) {
                    return res.status(401).json({
                        errors: [{
                            message: error
                        }]
                    });
                }
                return next();
            });
        })(req, res, next);
    } else {
        var ba = express.basicAuth(function (username, password, callback) {
            User.authenticate(username, password, callback);
        });
        ba(req, res, next);
    }
}

function setOpenhab(req, res, next) {
    req.user.openhab(function(error, openhab) {
        if (!error && openhab) {
            req.openhab = openhab;
        } else {
            if (error) {
                logger.error("openHAB-cloud: openHAB lookup error: " + error);
            } else {
                logger.warn("openHAB-cloud: Can't find the openHAB of user which is unbelievable");
            }
        }
        next();
    });
}

function preassembleBody(req, res, next) {
    var data = '';
    req.on('data', function(chunk) {
        data += chunk;
    });
    req.on('end', function() {
        req.rawBody = data;
        next();
    });
}

function proxyRouteOpenhab(req, res) {
    req.connection.setTimeout(600000);
    // console.log(req.method + " " + req.path + " from openhab " + req.openhab.uuid + " for " + req.user.username);
    if (req.openhab.status == 'offline') {
        res.writeHead(500, 'openHAB is offline', {'content-type': 'text/plain'});
        res.end('openHAB is offline');
        return;
    }

    // TODO: migrate this to redis incr?
    // increment request id and fix it
    requestCounter++;
    var requestId = requestCounter;
    // make a local copy of request headers to modify
    var requestHeaders =  req.headers;
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
    requestHeaders['host'] = req.headers.host || config.system.baseurl;
    requestHeaders['user-agent'] = "openhab-cloud/0.0.1";
    // console.log(req.path);
    // Strip off path prefix for remote vhosts hack
    var requestPath = req.path;
    if (requestPath.indexOf('/remote/') == 0) {
        requestPath = requestPath.replace('/remote', '');
        // TODO: this is too dirty :-(
        delete requestHeaders['host'];
        requestHeaders['host'] = "home." + config.system.baseurl;
    }
    // console.log(requestPath);
    // Send a message with request to openhab agent module
    // newAccessLog = new AccessLog({openhab: req.openhab.id, user: req.user.id, path: requestPath, method: req.method,
    // remoteHost: remoteHost});
    // newAccessLog.save();
    io.sockets.in(req.openhab.uuid).emit('request', {id:requestId, method: req.method,
        headers: requestHeaders, path:requestPath, query: req.query, body: req.rawBody});
    res.openhab = req.openhab;
    restRequests[requestId] = res;

    //when a response is closed by the requester
    res.on('close', function() {
    	// console.log("Request " + requestId + " was closed before serving");
        io.sockets.in(req.openhab.uuid).emit('cancel', {id:requestId});
        delete restRequests[requestId];
    });

    //when a response is closed by us
    res.on('finish', function() {
        delete restRequests[requestId];
    });

}

function addAppleRegistration(req, res) {
    if (!req.query.hasOwnProperty('regId')) {
        res.send(404, "Parameters missing");
        return;
    }
    var registrationId = req.query['regId'];
    if (req.query.hasOwnProperty('deviceId')) {
        var deviceId = req.query['deviceId'];
    } else {
        var deviceId = 'unknown';
    }
    if (req.query.hasOwnProperty('deviceModel')) {
        var deviceModel = req.query['deviceModel'];
    } else {
        var deviceModel = 'unknown';
    }
    UserDevice.findOne({owner: req.user.id, deviceType: 'ios', deviceId: deviceId}, function(error, userDevice) {
        if (!error) {
            if (userDevice) {
                // If found, update device token and save
                logger.info("openHAB-cloud: Found iOS device for user " + req.user.username + ", updating");
                userDevice.iosDeviceToken = registrationId;
                userDevice.lastUpdate = new Date;
                userDevice.save(function(error) {
			if (error) {
				logger.error("openHAB-cloud: Error saving user device: " + error);
			}
		});
                res.send(200, "Updated");
            } else {
                // If not found, add new device registration
                logger.info("openHAB-cloud: Registering new iOS device for user " + req.user.username);
                var userDevice = new UserDevice({owner: req.user.id, deviceType: 'ios', deviceId: deviceId,
                    iosDeviceToken: registrationId, deviceModel: deviceModel, lastUpdate: new Date,
                    registered: new Date});
                userDevice.save(function(error) {
                        if (error) {
                                logger.error("openHAB-cloud: Error saving user device: " + error);
                        }
                });
                res.send(200, "Added");
            }
        } else {
            logger.warn("openHAB-cloud: Error looking up device: " + error);
            res.send(500, "Internal server error");
        }
    });

}

function addAndroidRegistration(req, res) {
	//    if (!req.query.hasOwnProperty('regId') || !req.query.hasOwnProperty('deviceId')
	//        || !req.query.hasOwnProperty('deviceModel')) {
	//        res.send(404, "Parameters missing");
	//        return;
	//    }
    if (!req.query.hasOwnProperty('regId')) {
        res.send(404, "Parameters missing");
        return;
    }
    var registrationId = req.query['regId'];
    if (req.query.hasOwnProperty('deviceId')) {
        var deviceId = req.query['deviceId'];
    } else {
        var deviceId = 'unknown';
    }
    if (req.query.hasOwnProperty('deviceModel')) {
        var deviceModel = req.query['deviceModel'];
    } else {
        var deviceModel = 'unknown';
    }
    // Try to find user device by device Id
    UserDevice.findOne({owner: req.user.id, deviceType: 'android', deviceId: deviceId}, function(error, userDevice) {
        if (!error) {
            if (userDevice) {
                // If found, update the changed registration id
                logger.info("openHAB-cloud: Found an Android device for user " + req.user.username + ", updating");
                userDevice.androidRegistration = registrationId;
                userDevice.lastUpdate = new Date;
                userDevice.save(function(error) {
                        if (error) {
                                logger.error("openHAB-cloud: Error saving user device: " + error);
                        }
                });
                res.send(200, "Updated");
            } else {
                // If not found, try to find device by registration id. Sometimes android devices change their
                // ids dynamically, while google play services continue to return the same registration id
                // so this is still the same device and we don't want any duplicates
                UserDevice.findOne({owner: req.user.id, deviceType: 'android', androidRegistration: registrationId},
                    function(error, userDevice) {
                    if (!error) {
                        if (userDevice) {
                            // If found, update the changed device id
                            userDevice.deviceId = deviceId;
                            userDevice.lastUpdate = new Date;
                            userDevice.save(function(error) {
                        	if (error) {
                                	logger.error("openHAB-cloud: Error saving user device: " + error);
                        	}
                	    });
                            res.send(200, "Updated");
                        } else {
                            // If not found, finally register a new one
                            var userDevice = new UserDevice({owner: req.user.id, deviceType: 'android', deviceId: deviceId,
                                androidRegistration: registrationId, deviceModel: deviceModel, lastUpdate: new Date,
                                registered: new Date});
                            userDevice.save(function(error) {
                        	if (error) {
                                	logger.error("openHAB-cloud: Error saving user device: " + error);
                        	}
                	    });
                            res.send(200, "Added");
                        }
                    } else {
                        logger.warn("openHAB-cloud: Error looking up device: " + error);
                        res.send(500, "Internal server error");
                    }
                });
            }
        } else {
            logger.warn("openHAB-cloud: Error looking up device: " + error);
            res.send(500, "Internal server error");
        }
    });
}

// Process all requests from mobile apps to openHAB
app.all('/rest*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/images/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/static/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/rrdchart.png*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/chart*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/openhab.app*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/WebApp*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/CMD*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/cometVisu*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/proxy*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/greent*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/jquery.*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/classicui/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/ui/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/basicui/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/doc/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/start/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/icon*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/habmin/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/remote*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);
app.all('/habpanel/*', restAuth, preassembleBody, setOpenhab, proxyRouteOpenhab);

// myOH API for mobile apps
app.all('/api/v1/notifications*', restAuth, preassembleBody, setOpenhab, api_routes.notificationsget);

// Android app registration
app.all('/addAndroidRegistration*', restAuth, preassembleBody, setOpenhab, addAndroidRegistration);
app.all('/addAppleRegistration*', restAuth, preassembleBody, setOpenhab, addAppleRegistration);

function sendSimpleNotificationToUser(user, message) {
    sendNotificationToUser(user, message, '', '');
}

function sendNotificationToUser(user, message, icon, severity) {
    var androidRegistrations = [];
    var iosDeviceTokens = [];
    newNotification = new Notification({user: user.id, message: message, icon: icon, severity: severity});
    newNotification.save(function(error) {
	if (error) {
		logger.error("openHAB-cloud: Error saving notification: " + error);
	}
    });
    UserDevice.find({owner: user.id}, function(error, userDevices) {
        if (!error) {
            if (userDevices) {
                for (var i=0; i<userDevices.length; i++) {
                    if (userDevices[i].deviceType == 'android') {
                        androidRegistrations.push(userDevices[i].androidRegistration);
                    } else if (userDevices[i].deviceType == 'ios') {
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
            } else {
                // User don't have any registered devices, so we will skip it.
            }
        } else {
            logger.warn("openHAB-cloud: Error fetching devices for user: " + error);
        }
    });
}

function sendIosNotifications(iosDeviceTokens, message) {
    for (var i=0; i<iosDeviceTokens.length; i++) {
        if (config.apn) {
            appleSender.sendAppleNotification(iosDeviceTokens[i], message);
        } else {
        	// logger.debug("Emulating send notification to iOS " + iosDeviceTokens[i] + ", message = " + message);
        }
    }
}

function sendAndroidNotification(registrationId, message) {
    var registrationIds = [];
    registrationIds.push(registrationId);
    sendAndroidNotifications(registrationIds, message);
}

function sendAndroidNotifications(registrationIds, message) {
    redis.incr("androidNotificationId", function(error, androidNotificationId) {
        if (config.gcm) {
            if (!error) {
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
                        logger.error("openHAB-cloud: GCM send error: " + err);
                    }
                });
            }
        } else {
            for (var i=0; i<registrationIds.length; i++) {
            	// logger.debug("Emulating send notification to Android " + registrationIds[i] + ", message = ", message);
            }
        }
    });
}

// In case of polling transport set poll duration to 300 seconds
io.set("polling duration", 300);

io.use(function(socket, next) {
    var handshakeData = socket.handshake;
    logger.info("openHAB-cloud: Authorizing incoming openHAB connection");
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
    Openhab.findOne({uuid: handshakeData.uuid, secret: handshakeSecret}, function(error, openhab) {
        if (error) {
            logger.error("openHAB-cloud: openHAB lookup error: " + error);
            next(error);
        } else {
            if (openhab) {
                next();
            } else {
                logger.info("openHAB-cloud: openHAB " + handshakeData.uuid + " not found");
                next(new Error('not authorized'));
            }
        }
    });
});

io.sockets.on('connection',function(socket){
	// console.log(socket.handshake);
    logger.info('openHAB-cloud: Incoming openHAB connection for uuid ' + socket.handshake.uuid);
    socket.join(socket.handshake.uuid);
    // Remove openHAB from offline array if needed
    delete offlineOpenhabs[socket.handshake.uuid];
    Openhab.findOne({uuid: socket.handshake.uuid}, function(error, openhab) {
        if (!error && openhab) {
            logger.info("openHAB-cloud: Connected openHAB with " + socket.handshake.uuid + " successfully");
            // Make an openhabaccesslog entry anyway
            var remoteHost = socket.handshake.headers['x-forwarded-for'] || socket.client.conn.remoteAddress;
            var newOpenhabAccessLog = new OpenhabAccessLog({openhab: openhab.id, remoteHost: remoteHost,
                remoteVersion: socket.handshake.openhabVersion, remoteClientVersion: socket.handshake.clientVersion});
            newOpenhabAccessLog.save(function(error) {
        		if (error) {
		        	logger.error("openHAB-cloud: Error saving openHAB access log: " + error);
		        }
	        });
            // Make an event and notification only if openhab was offline
            // If it was marked online, means reconnect appeared because of my.oh fault
            // We don't want massive events and notifications when node is restarted
            if (openhab.status == 'offline') {
                openhab.status = 'online';
                openhab.last_online = new Date;
                openhab.openhabVersion = socket.handshake.openhabVersion;
                openhab.clientVersion = socket.handshake.clientVersion;
                openhab.save(function(error) {
			        if (error) {
				        logger.error("openHAB-cloud: Error saving openHAB: " + error);
			        }
		        });
                var connectevent = new Event({openhab: openhab.id, source: "openhab", status: "online", color: "good"});
                connectevent.save(function(error) {
			        if (error) {
				        logger.error("openHAB-cloud: Error saving connect event: " + error);
			        }
		        });
                notifyOpenHABStatusChange(openhab, "online");
            } else {
                openhab.openhabVersion = socket.handshake.openhabVersion;
                openhab.clientVersion = socket.handshake.clientVersion;
                openhab.save(function(error) {
			        if (error) {
				    logger.error("openHAB-cloud: Error saving openhab: " + error);
			    }
		        });
            }
            socket.openhabUuid = openhab.uuid;
            socket.openhabId = openhab.id;
        } else {
            if (error) {
                logger.error("openHAB-cloud: Error looking up openHAB: " + error);
            } else {
                logger.warn("openHAB-cloud: Unable to find openHAB " + socket.handshake.uuid);
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

    socket.on('response', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid) {
            	// self.to(self.handshake.uuid).emit('response', data);
                if (data.error != null) {
                    restRequests[requestId].send(500, "Timeout in transit");
                } else {
                    if (data.headers['Content-Type'] != null) {
                        var contentType = data.headers['Content-Type'];
                        restRequests[requestId].contentType(contentType);
                    }
                    restRequests[requestId].send(data.responseStatusCode, new Buffer(data.body, 'base64'));
                }
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        } else {
            self.emit('cancel', {id:requestId});
        }
    });
    socket.on('responseHeader', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid && !restRequests[requestId].headersSent) {
            	// self.to(self.handshake.uuid).emit('responseHeader', data);
                restRequests[requestId].writeHead(data.responseStatusCode, data.responseStatusText, data.headers);
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        } else {
            self.emit('cancel', {id:requestId});
        }
    });
    // This is a method for old versions of openHAB-cloud bundle which use base64 encoding for binary
    socket.on('responseContent', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid) {
            	// self.to(self.handshake.uuid).emit('responseContent', data);
                restRequests[requestId].write(new Buffer(data.body, 'base64'));
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        } else {
            self.emit('cancel', {id:requestId});
        }
    });
    // This is a method for new versions of openHAB-cloud bundle which use bindary encoding
    socket.on('responseContentBinary', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid) {
                restRequests[requestId].write(data.body);
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        } else {
            self.emit('cancel', {id:requestId});
        }
    });
    socket.on('responseFinished', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid) {
            	// self.to(self.handshake.uuid).emit('responseFinished', data);
                restRequests[requestId].end();
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        }
    });
    socket.on('responseError', function(data) {
        var self = this;
        var requestId = data.id;
        if (restRequests[requestId] != null) {
            if (self.handshake.uuid == restRequests[requestId].openhab.uuid) {
            	// self.to(self.handshake.uuid).emit('responseError', data);
                restRequests[requestId].send(500, data.responseStatusText);
            } else {
                logger.warn("openHAB-cloud: " + self.handshake.uuid + " tried to respond to request which it doesn't own");
            }
        }
    });
    socket.on('notification', function(data) {
        var self = this;
        logger.info("openHAB-cloud: Notification request from " + self.handshake.uuid + " to user " + data.userId);
        User.findOne({username: data.userId}, function(error, user) {
            if (!error && user) {
                user.openhab(function(error, openhab) {
                    if (!error && openhab) {
                        if (openhab.uuid == self.handshake.uuid) {
                        	// self.to(self.handshake.uuid).emit('notification', data);
                            logger.info("openHAB-cloud: Notification from " + self.handshake.uuid + " to " + user.username);
                            sendNotificationToUser(user, data.message, data.icon, data.severity);
                        } else {
                            logger.warn("openHAB-cloud: oopenHAB " + self.handshake.uuid + " requested notification for user (" + user.username + ") which it does not belong to");
                        }
                    } else {
                        if (error) {
                            logger.error("openHAB-cloud: openHAB lookup error: " + error);
                        } else {
                            logger.warn("openHAB-cloud: Unable to find openHAB for user " + user.username);
                        }
                    }
                });
            } else {
                if (error) {
                    logger.error("openHAB-cloud: User lookup error: " + error);
                } else {
                	// console.log("user " + data.userId + " not found");
                }
            }
        });
    });
    socket.on('broadcastnotification', function(data) {
        var self = this;
        Openhab.findById(self.openhabId, function(error, openhab) {
            if (!error && openhab) {
            	// self.to(self.handshake.uuid).emit('broadcastnotification', data);
                User.find({account: openhab.account}, function(error, users) {
                    if (!error && users) {
                        for (var i=0; i<users.length; i++) {
                            sendNotificationToUser(users[i], data.message, data.icon, data.severity);
                        }
                    } else {
                        if (error) {
                            logger.error("openHAB-cloud: Error getting users list: " + error);
                        } else {
                            logger.debug("openHAB-cloud: No users found for openHAB");
                        }
                    }
                });
            } else {
                if (error) {
                    logger.error("openHAB-cloud: openHAB lookup error: " + error);
                } else {
                    logger.debug("openHAB-cloud: openHAB not found");
                }
            }
        });
    });
    socket.on('lognotification', function(data) {
        var self = this;
        Openhab.findById(self.openhabId, function(error, openhab) {
            if (!error && openhab) {
//                self.to(self.handshake.uuid).emit('lognotification', data);
                User.find({account: openhab.account}, function(error, users) {
                     if (!error && users) {
                        for (var i=0; i<users.length; i++) {
                            newNotification = new Notification({user: users[i].id, message: data.message, icon: data.icon,
                                severity: data.severity});
                            newNotification.save(function(error) {
				if (error) {
					logger.error("Error saving notification: " + error);
				}
			    });
                        }
                    } else {
                        if (error) {
                            logger.error("Error getting users list: " + error);
                        } else {
                            logger.debug("No users found for openhab");
                        }
                    }
                });
            } else {
                if (error) {
                    logger.error("openHAB lookup error: " + error);
                } else {
                    logger.debug("openHAB not found");
                }
            }
        });
    });
    socket.on('itemupdate', function(data) {
        var self = this;
        //if openhabId is missing then user has not completed auth
        if(self.openhabId === undefined){
          return;
        }
        var limiter = new Limiter({ id: self.openhabId, db: redis, max:20, duration:60000});
        limiter.get(function(err, limit){
          if(err) {
            logger.error("openHAB-cloud: Rate limit error " + err);
            return;
          }
          if(!limit.remaining){
            //logger.debug("rate limiting  " + self.handshake.uuid + " remainging " + limit.remaining);
            return;
          }
          var itemName = data.itemName;
          var itemStatus = data.itemStatus;
          // Find openhab
          if (itemStatus.length < 100) {
              Openhab.findById(self.openhabId).cache().exec(function(error, openhab) {
            	  // self.to(self.handshake.uuid).emit('itemupdate', data);
                  if (!error && openhab) {
                      // Find the item (which should belong to this openhab)
                      Item.findOne({openhab: openhab.id, name: itemName}).cache().exec(function(error, itemToUpdate) {
                          if (!error) {
                              // If no item found for this openhab with this name, create a new one
                              if (!itemToUpdate) {
                                  logger.info("openHAB-cloud: Item " + itemName + " for openHAB " + openhab.uuid + " not found, creating new one");
                                  itemToUpdate = new Item({openhab: openhab.id, name: itemName, last_change: new Date,
                                      status: ''});
                              }
                              // If item status changed, update item and create new item status change event
                              if (itemToUpdate.status != itemStatus) {
                            	  // logger.info("Item " + itemToUpdate.name + " changed from " + itemToUpdate.status + " to " + itemStatus);
                                  // Update previous status value
                                  itemToUpdate.prev_status = itemToUpdate.status;
                                  // Set new status value
                                  itemToUpdate.status = itemStatus;
                                  // Set last update timestamp to current time
                                  itemToUpdate.last_update = new Date;
                                  // Add the new status change to states array of item
                                  //  itemToUpdate.states.push({when: new Date, value: itemStatus});
                                  //  while (itemToUpdate.states.length > 50) {
                                  		// itemToUpdate.states.splice(0, 1);
                                  	//  }
                                  // Save the updated item
                                  itemToUpdate.save(function(error) {
  					                if (error) {
  						                logger.error("openHAB-cloud: Error saving item: " + error);
  					                }
  				                });
                                  // Check if the new state is int or float to store it to Number and create new item update event
                                  if (!isNaN(parseFloat(itemStatus))) {
                                      // This is silly, but we need to check if previous status was int or float
                                      if (!isNaN(parseFloat(itemToUpdate.prev_status))) {
                                          Event.collection.insert({openhab: mongoose.Types.ObjectId(openhab.id),
                                              source: itemName,
                                              status: itemStatus,
                                              oldStatus: itemToUpdate.prev_status,
                                              numericStatus: parseFloat(itemStatus),
                                              oldNumericStatus: parseFloat(itemToUpdate.prev_status),
                                              color: "info",
                                              when: new Date
                                          }, function(error) {
                                              if (error) {
                                                  logger.error("openHAB-cloud: Error saving event: " + error);
                                              }
                                          });
                                          /*   Event.create({openhab: openhab.id,
                                              source: itemName,
                                              status: itemStatus,
                                              oldStatus: itemToUpdate.prev_status,
                                              numericStatus: parseFloat(itemStatus),
                                              oldNumericStatus: parseFloat(itemToUpdate.prev_status),
                                              color: "info"
                                          }, function(error) {
  						                    if (error) {
  							                    logger.error("Error saving event: " + error);
  						                    }
  					                    });*/
                                      } else {
                                          Event.collection.insert({
                                              openhab: mongoose.Types.ObjectId(openhab.id),
                                              source: itemName,
                                              status: itemStatus,
                                              oldStatus: itemToUpdate.prev_status,
                                              numericStatus: parseFloat(itemStatus),
                                              color: "info",
                                              when: new Date
                                          }, function(error) {
                                                  if (error) {
                                                          logger.error("openHAB-cloud: Error saving event: " + error);
                                                  }
                                          });
                                      }
                                  } else {
                                      Event.collection.insert({openhab: mongoose.Types.ObjectId(openhab.id), source: itemName,
                                          status: itemStatus, oldStatus: itemToUpdate.prev_status,
                                          color: "info", when: new Date}, function(error) {
                                          if (error) {
                                              logger.error("openHAB-cloud: Error saving event: " + error);
                                          }
                                      });
                                  }
                                  // Thus if item status didn't change, there will be no event...
                              }
                          } else {
                              logger.warn("openHAB-cloud: Unable to find item for itemUpdate: " + error);
                          }
                      });
                  } else {
                      if (error) {
                          logger.warn("openHAB-cloud: Unable to find openHAB for itemUpdate: " + error);
                      } else {
                          logger.info("openHAB-cloud: Unable to find openHAB for itemUpdate: openHAB doesn't exist");
                      }
                  }
              });
          } else {
              logger.info("openHAB-cloud: Item " + itemName + " status.length (" + itemStatus.length + ") is too big, ignoring update");
          }
        });
    });
    socket.on('updateConfig', function(data) {
        var self = this;
        Openhab.findOne({uuid: self.handshake.uuid}, function(error, openhab) {
            if (!error && openhab) {
                logger.info("openHAB-cloud: openHAB " + self.handshake.uuid + " requested to update " + data.type + " config " +
                data.name + " with timestamp = " + data.timestamp);
                OpenhabConfig.findOne({openhab: openhab.id, type: data.type, name: data.name},
                    function(error, openhabConfig) {
                    if (!error) {
                        if (!openhabConfig) {
                            logger.info("openHAB-cloud: No config found, creating new one");
                            openhabConfig = new OpenhabConfig({type: data.type, name: data.name,
                                timestamp: new Date(data.timestamp), config: data.config, openhab: openhab.id});
                            openhabConfig.markModified();
                            openhabConfig.save(function(error) {
                                if (error != null) {
                                    logger.warn("openHAB-cloud: Error saving new openhab config: " + error);
                                }
                            });
                        } else {
                            logger.info("openHAB-cloud: My timestamp = " + openhabConfig.timestamp + ", remote timestamp = " +
                                new Date(data.timestamp));
                            if (openhabConfig.timestamp > new Date(data.timestamp)) {
                                logger.info("openHAB-cloud: My config is newer");
                                io.sockets.in(openhab.uuid).emit('updateConfig', {timestamp: openhabConfig.timestamp,
                                    name: openhabConfig.name, type: openhabConfig.type,
                                    config: openhabConfig.config});
                            } else  {
                                if (openhabConfig.timestamp < new Date(data.timestamp)) {
                                    logger.info("openHAB-cloud: Remote config is newer, updating");
                                    openhabConfig.config = data.config;
                                    openhabConfig.timestamp = new Date(data.timestamp);
                                    openhabConfig.markModified();
                                    openhabConfig.save();
                                    io.sockets.in(openhab.uuid).emit('updateConfig', {timestamp: openhabConfig.timestamp,
                                        config: openhabConfig.config});
                                } else {
                                    logger.info("openHAB-cloud: My config = remote config");
                                    io.sockets.in(openhab.uuid).emit('updateConfig', {timestamp: openhabConfig.timestamp,
                                        config: openhabConfig.config});
                                }
                            }
                        }
                    } else {
                        logger.warn("openHAB-cloud: Failed to find " + self.openhab.uuid + " config: " + error);
                    }
                });
            } else {
                if (error) {
                    logger.warn(error);
                } else {
                    logger.warn("openHAB-cloud: Unable to find openhab " + self.handshake.uuid);
                }
            }
        });
    });
    socket.on('disconnect', function() {
        var self = this;
        // Find any other sockets for this openHAB and if any, don't mark openHAB as offline
        for (var connectedSocketId in io.sockets.connected) {
            var connectedSocket = io.sockets.connected[connectedSocketId];
            if (connectedSocket != self && connectedSocket.openhabUuid == self.handshake.uuid) {
                logger.info("openHAB-cloud: Found another connected socket for " + self.handshake.uuid + ", will not mark offline");
                return;
            }
        }
        Openhab.findById(self.openhabId, function(error, openhab) {
            if (!error && openhab) {
                offlineOpenhabs[openhab.uuid] = Date.now();
                logger.info("openHAB-cloud: Disconnected " + openhab.uuid);
            }
        });
    });
});

function notifyOpenHABStatusChange(openhab, status) {
    User.find({account: openhab.account, role: 'master'}, function(error, users) {
        if (!error && users) {
            for (var i=0; i<users.length; i++) {
                if (status == 'online') {
                    sendNotificationToUser(users[i], "openHAB is online", "openhab", "good");
                } else {
                    sendNotificationToUser(users[i], "openHAB is offline", "openhab", "bad");
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
    logger.info("openHAB-cloud: Stopping every5min statistics job");
    every5MinStatJob.stop();

    logger.info("openHAB-cloud: Safe shutdown complete");
    process.exit( );
}

process.on( 'SIGINT', function() {
    logger.info("openHAB-cloud frontend is shutting down from SIGINT" );
    shutdown();
});

process.on( 'SIGTERM', function() {
    logger.info("openHAB-cloud frontend is shutting down from SIGTERM" );
    shutdown();
});

module.exports.sio = io;

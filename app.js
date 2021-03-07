/**
 * Copyright (c) 2010-2019 Contributors to the openHAB project
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
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
    system = require('./system'),
    env = process.env.NODE_ENV || 'production',
    config;


//load and set our configuration, delete any cache first
var loadConfig = function () {
    delete require.cache[require.resolve('./config.json')];
    config = require('./config.json');
    system.setConfiguration(config);
}

loadConfig();

var internalAddress = system.getInternalAddress();

//require('heapdump');

logger.info('openHAB-cloud: Backend service is starting up...');

process.on('uncaughtException', function (err) {
    console.log(JSON.stringify(err))
    logger.error(err);
});

process.on('SIGHUP', function () {
    logger.info('Reloading config...');
    loadConfig();
});

logger.info('openHAB-cloud: Backend logging initialized...');

// Initialize the main configuration
var taskEnv = process.env.TASK || 'main';

// If Firebase Cloud Messaging is configured set it up
if (system.isGcmConfigured()) {
    require('./fcm-xmpp');
}

module.exports.config = config;

// Setup all homepage
var flash = require('connect-flash'),
    express = require('express'),
    bodyParser = require('body-parser'),
    errorHandler = require('errorhandler'),
    morgan = require('morgan'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    favicon = require('serve-favicon'),
    firebase = require('./notificationsender/firebase');
    csurf = require('csurf'),
    serveStatic = require('serve-static'),
    homepage = require('./routes/homepage'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    fs = require('fs'),
    passport = require('passport'),
    RedisStore = require('connect-redis')(session),
    redis = require('./redis-helper'),
    date_util = require('./date_util.js'),
    appleSender = require('./notificationsender/aps-helper'),
    oauth2 = require('./routes/oauth2'),
    auth = require('./auth.js'),
    Limiter = require('ratelimiter'),
    requesttracker = require('./requesttracker'),
    routes = require('./routes'),
    MongoConnect = require('./system/mongoconnect');

// MongoDB connection settings
var mongoose = require('mongoose');
// MongoDB Caching for Item updates
var cachegoose = require('cachegoose');
cachegoose(mongoose, {
    engine: 'redis',
    port: config.redis.port,
    host: config.redis.host,
    password: config.redis.password,
});
var cacheTTL = config.cacheTTL || 600;

// Try to setup a mongodb connection, otherwise stopping
var mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);

var mongooseTypes = require('mongoose-types');
mongooseTypes.loadTypes(mongoose);

var app = express();

// A list of requests which are awaiting for responses from openHABs
var requestTracker = new requesttracker();

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
function notifyOpenHABOwnerOffline(openhab) {

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
}

// This timer runs every minute and checks if there are any openHABs in offline status for more then 300 sec
// Then it sends notifications to openHAB's owner if it is offline for more then 300 sec
// This timer only runs on the job task
if (taskEnv === 'main') {
    setInterval(function () {
        logger.debug('openHAB-cloud: Checking for offline openHABs (' + Object.keys(offlineOpenhabs).length + ')');
        for (var offlineOpenhabUuid in offlineOpenhabs) {
            if (Date.now() - offlineOpenhabs[offlineOpenhabUuid] < 5 * 60 * 1000) {
                continue;
            }
            delete offlineOpenhabs[offlineOpenhabUuid];
            logger.debug('openHAB-cloud: openHAB with ' + offlineOpenhabUuid + ' is offline > 300 sec, time to notify the owner');
            Openhab.findOne({
                uuid: offlineOpenhabUuid
            }).exec(function (error, openhab) {
                if (!openhab || error) {
                    return;
                }
                //if this has not connected to another server, then notify
                if (openhab.serverAddress == internalAddress) {
                    notifyOpenHABOwnerOffline(openhab);
                }
            });
        }
    }, 60000);
}

//cancel restRequests that have become orphaned.  For some reason neither close
//nor finish is being called on some response objects and we end up hanging on
//to these in our restRequests map.  This goes through and finds those orphaned
//responses and cleans them up, otherwise memory goes through the roof.
setInterval(function () {
    var requests = requestTracker.getAll();
    logger.debug('openHAB-cloud: Checking orphaned rest requests (' + requestTracker.size() + ')');
    Object.keys(requests).forEach(function (requestId) {
        var res = requests[requestId];
        if (res.finished) {
            logger.debug('openHAB-cloud: expiring orphaned response');
            requestTracker.remove(requestId);
            if (res.openhab) {
                io.sockets.in(res.openhab.uuid).emit('cancel', {
                    id: requestId
                });
            }
        }
    })
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
const { request } = require('http');
every5MinStatJob.start();

// Configure the openHAB-cloud for development mode, if in development
if (app.get('env') === 'development') {
    app.use(errorHandler());
}

// App configuration for all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(favicon(__dirname + '/public/img/favicon.ico'));
if (system.getLoggerMorganOption())
    app.use(system.getLoggerMorganOption());

app.use(bodyParser.json({ verify: function (req, res, buf) { req.rawBody = buf } }))
app.use(bodyParser.urlencoded({
    verify: function (req, res, buf) { req.rawBody = buf },
    extended: true

}));

app.use(cookieParser(config.express.key));

// Configurable support for cross subdomain cookies
var cookie = {};
if (config.system.subDomainCookies) {
    cookie.path = '/';
    cookie.domain = '.' + system.getHost();
    logger.info('openHAB-cloud: Cross sub domain cookie support is configured for domain: ' + cookie.domain);
}
app.use(session({
    secret: config.express.key,
    store: new RedisStore({
        host: 'localhost',
        port: 6379,
        client: redis,
        logErrors: true
    }),
    cookie: cookie,
    resave: false,
    saveUninitialized: false
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
//TODO we need to remove this hack, its leftover from long ago.
//we need to know if this is a proxy connection or not (home/remote), other middleware depends on it.
app.use(function (req, res, next) {
    var host = req.headers.host;
    //  console.log(host);
    if (!host) {
        next(); // No host in header, just go ahead
    }
    // If host matches names for full /* proxying, go ahead and just proxy it.
    if (host.indexOf('remote.') === 0 || host.indexOf('home.') === 0) {
        //make sure this was not set by another server
        if (req.url.indexOf('/remote') != 0) {
            req.url = '/remote' + req.url;
        }
    }
    next();
});
app.use(function (req, res, next) {
    var csrf = csurf();
    // Check if url needs csrf, remote connections and REST connections are excluded from CSRF
    if (!req.path.match('/rest*') && !req.path.match('/oauth2/token') && !req.path.match('/ifttt/*') && !req.path.match('/remote/*'))
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
            res.locals.proxyUrl = system.getProxyURL();
            if (!error && openhab) {
                res.locals.openhab = openhab;
                res.locals.openhabstatus = openhab.status;
                res.locals.openhablastonline = openhab.last_online;
                if (openhab.openhabVersion !== undefined) {
                    res.locals.openhabMajorVersion = parseInt(openhab.openhabVersion.split('.')[0]);
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

    res.locals.date_util = date_util;

    res.locals.legal = false;
    if (config.legal) {
        res.locals.legal = true;
        res.locals.terms = config.legal.terms;
        res.locals.policy = config.legal.policy;
    }
    res.locals.registration_enabled = system.isUserRegistrationEnabled();
    next();
});

app.use(serveStatic(path.join(__dirname, 'public')));

var server = app.listen(system.getNodeProcessPort(), function () {
    logger.info('openHAB-cloud: express server listening on port ' + system.getNodeProcessPort());
});

var io = require('socket.io')(server, {
    logger: logger
});

// setup the routes for the app
var rt = new routes(requestTracker, logger);
rt.setSocketIO(io);
rt.setupRoutes(app);

function sendNotificationToUser(user, message, icon, severity) {
    var androidRegistrations = [];
    var iosDeviceTokens = [];
    var newNotification = new Notification({
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
            firebase.sendNotification(androidRegistrations, newNotification);
        }
        // If we found any ios devices, send notification
        if (iosDeviceTokens.length > 0) {
            sendIosNotifications(iosDeviceTokens, newNotification);
        }
    });
}

function sendIosNotifications(iosDeviceTokens, notification) {
    if (!config.apn) {
        return;
    }
    var payload = {
        severity: notification.severity,
        icon: notification.icon,
        persistedId: notification._id,
        timestamp: notification.created.getTime()
    };
    for (var i = 0; i < iosDeviceTokens.length; i++) {
        appleSender.sendAppleNotification(iosDeviceTokens[i], notification.message, payload);
    }
}

// In case of polling transport set poll duration to 300 seconds
//io.set('polling duration', 300);

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
            logger.info('openHAB-cloud: uuid ' + socket.handshake.uuid + ' server address ' + openhab.serverAddress + " my address " + internalAddress);
            if (openhab.status === 'offline' || openhab.serverAddress !== internalAddress) {
                openhab.status = 'online';
                openhab.serverAddress = internalAddress;
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
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid) {
                if (data.error !== null) {
                    request.send(500, 'Timeout in transit');
                } else {
                    if (data.headers['Content-Type'] !== null) {
                        var contentType = data.headers['Content-Type'];
                        request.contentType(contentType);
                    }
                    request.send(data.responseStatusCode, new Buffer(data.body, 'base64'));
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
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid && !request.headersSent) {
                request.writeHead(data.responseStatusCode, data.responseStatusText, data.headers);
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
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid) {
                request.write(new Buffer(data.body, 'base64'));
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
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid) {
                request.write(data.body);
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
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid) {
                request.end();
            } else {
                logger.warn('openHAB-cloud: ' + self.handshake.uuid + ' tried to respond to request which it doesn\'t own');
            }
        }
    });
    socket.on('responseError', function (data) {
        var self = this;
        var requestId = data.id,
            request;
        if (requestTracker.has(requestId)) {
            request = requestTracker.get(requestId);
            if (self.handshake.uuid === request.openhab.uuid) {
                request.send(500, data.responseStatusText);
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
        Openhab.findById(this.openhabId, function (error, openhab) {
            if (error) {
                logger.error('openHAB-cloud: openHAB lookup error: ' + error);
                return;
            }
            if (!openhab) {
                logger.debug('openHAB-cloud: openHAB not found');
                return;
            }

            User.find({
                account: openhab.account
            }, function (error, users) {
                if (error) {
                    logger.error('openHAB-cloud: Error getting users list: ' + error);
                    return;
                }

                if (!users) {
                    logger.debug('openHAB-cloud: No users found for openHAB');
                    return;
                }

                for (var i = 0; i < users.length; i++) {
                    sendNotificationToUser(users[i], data.message, data.icon, data.severity);
                }
            });
        });
    });

    socket.on('lognotification', function (data) {
        Openhab.findById(this.openhabId, function (error, openhab) {
            if (error) {
                logger.error('openHAB lookup error: ' + error);
                return;
            }
            if (!openhab) {
                logger.debug('openHAB not found');
                return;
            }
            User.find({
                account: openhab.account
            }, function (error, users) {
                if (error) {
                    logger.error('openHAB-cloud: Error getting users list: ' + error);
                    return;
                }

                if (!users) {
                    logger.debug('openHAB-cloud: No users found for openHAB');
                    return;
                }

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
            });
        });
    });

    socket.on('itemupdate', function (data) {
        //disabling item updates for now
        return;
        var self = this;
        //if openhabId is missing then user has not completed auth
        if (self.openhabId === undefined) {
            return;
        }
        var limiter = new Limiter({
            id: self.openhabId,
            db: redis,
            max: 10,
            duration: 30000
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
            Openhab.findById(self.openhabId).cache(cacheTTL).exec(function (error, openhab) {
                if (error) {
                    logger.warn('openHAB-cloud: Unable to find openHAB for itemUpdate: ' + error);
                    return;
                }
                if (!openhab) {
                    logger.info('openHAB-cloud: Unable to find openHAB for itemUpdate: openHAB doesn\'t exist');
                    return;
                }
                // Find the item (which should belong to this openhab)
                var cacheKey = openhab.id + '-' + itemName;
                Item.findOne({
                    openhab: openhab.id,
                    name: itemName
                }).cache(cacheTTL, cacheKey).exec(function (error, itemToUpdate) {
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
                            cachegoose.clearCache(cacheKey);
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

    //we can mute notifications, for example when we are doing a deploy
    if (system.getMuteNotifications()) {
        return;
    }

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

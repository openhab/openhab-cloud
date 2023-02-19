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

// Main Logging setup
var logger = require('./logger.js'),
    system = require('./system'),
    config;

//load and set our configuration, delete any cache first
var loadConfig = function () {
    delete require.cache[require.resolve('./config.json')];
    config = require('./config.json');
    system.setConfiguration(config);
}

loadConfig();

module.exports.config = config;

//require('heapdump');

logger.info('Backend service is starting up...');

process.on('uncaughtException', function (err) {
    console.log(JSON.stringify(err))
    logger.error(err);
});

process.on('SIGHUP', function () {
    logger.info('Reloading config...');
    loadConfig();
});

logger.info('Backend logging initialized...');

// If Firebase Cloud Messaging is configured set it up
if (system.isGcmConfigured()) {
    require('./fcm-xmpp');
}

// Setup all homepage
var flash = require('connect-flash'),
    express = require('express'),
    bodyParser = require('body-parser'),
    errorHandler = require('errorhandler'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    favicon = require('serve-favicon'),
    csurf = require('csurf'),
    serveStatic = require('serve-static'),
    path = require('path'),
    passport = require('passport'),
    RedisStore = require('connect-redis')(session),
    redis = require('./redis-helper'),
    date_util = require('./date_util.js'),
    auth = require('./auth.js'),
    routes = require('./routes'),
    MongoConnect = require('./system/mongoconnect'),
    mongoose = require('mongoose'),
    cachegoose = require('recachegoose'),
    mongooseTypes = require('mongoose-types'),
    SocketIO = require('./socket-io');


cachegoose(mongoose, {
    engine: 'redis',
    port: config.redis.port,
    host: config.redis.host,
    password: config.redis.password,
});

// Try to setup a mongodb connection, otherwise stopping
var mongoConnect = new MongoConnect(system);
mongoConnect.connect(mongoose);
mongooseTypes.loadTypes(mongoose);

var app = express();

var every5MinStatJob = require('./jobs/every5minstat');
every5MinStatJob.start();

// Configurable support for cross subdomain cookies
var cookie = {};
if (config.system.subDomainCookies) {
    cookie.path = '/';
    cookie.domain = '.' + system.getHost();
    logger.info('Cross sub domain cookie support is configured for domain: ' + cookie.domain);
}

// Configure the openHAB-cloud for development mode, if in development
if (app.get('env') === 'development') {
    app.use(errorHandler());
}
if (system.getLoggerMorganOption()){
    app.use(system.getLoggerMorganOption());
}
// App configuration for all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(favicon(__dirname + '/public/img/favicon.ico'));
app.use(bodyParser.json({ verify: function (req, res, buf) { req.rawBody = buf } }))
app.use(bodyParser.urlencoded({
    verify: function (req, res, buf) { req.rawBody = buf },
    extended: true
}));
app.use(cookieParser(config.express.key));
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
// Add global usable locals for templates
app.use(function (req, res, next) {
    res.locals.baseurl = system.getBaseURL();
    res.locals.proxyUrl = system.getProxyURL();

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

var server = app.listen(system.getNodeProcessPort(), config.system.listenIp, function () {
    logger.info('express server listening on port ' + system.getNodeProcessPort());
});

// setup socket.io connections from openHABs
var socketIO = new SocketIO(server, system);
// setup the routes for the app
var rt = new routes(logger);
rt.setSocketIO(socketIO);
rt.setupRoutes(app);

function shutdown() {
    // TODO: save current request id?
    logger.info('Stopping every5min statistics job');
    every5MinStatJob.stop();

    logger.info('Safe shutdown complete');
    process.exit();
}

process.on('SIGINT', function () {
    logger.info('frontend is shutting down from SIGINT');
    shutdown();
});

process.on('SIGTERM', function () {
    logger.info('frontend is shutting down from SIGTERM');
    shutdown();
});

/**
 * Copyright (c) 2014-2016 by the respective copyright holders.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 */

/**
 * Director server for routing requests to a openHAB cloud server.  Incoming requests
 * are authenticated, then we lookup which server has a user's OH connection and
 * finally we send a 302 redirect back to route the request to that server.
 * NGINX will transparently handle the redirect so the end client never actually
 * sees the 302.
 **/

var logger = require("../logger.js"),
    cluster = require('cluster'),
    http = require('http'),
    flash = require('connect-flash'),
    express = require('express'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    session = require('express-session'),
    RedisStore = require('connect-redis')(session),
    config = require('../config.json'),
    redis = require('../redis-helper')(config.redis),
    mongoose = require('mongoose'),
    User = require('../models/user'),
    auth = require('../auth.js');

var numCPUs = require('os').cpus().length;

var port = process.env.PORT || 3000;


// Ensure user is authenticated for REST or proxied requets
var ensureAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    return passport.authenticate(['basic', 'bearer'], {
        session: false
    })(req, res, next);
};

//find a openHAB entry for a given user
var setOpenhab = function (req, res, next) {
    req.user.openhab(function (error, openhab) {
        if (!error && openhab) {
            req.openhab = openhab;
        } else {
            if (error) {
                logger.error("cloud-director: openHAB lookup error: " + error);
                return res.status(500).json({
                    errors: [{
                        message: error
                    }]
                });
            } else {
                logger.warn("cloud-director: Can't find the openHAB of user which is unbelievable");
                return res.status(500).json({
                    errors: [{
                        message: "openHAB not found"
                    }]
                });
            }
        }
        next();
    });
};

//redirect a request to a upstream cloud server
var redirectRequest = function (req, res, next) {
  res.redirect(301, 'http://' + req.openhab.socketServer);
};

if (cluster.isMaster) {
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    // MongoDB connection settings
    var cacheOpts = {
        max: 5000,
        maxAge: 1000 * 60 * 10
    };

    require('mongoose-cache').install(mongoose, cacheOpts);

    var mongoUri = 'mongodb://' +
        ((config.mongodb.user && config.mongodb.user.length > 0) ?
            config.mongodb.user + ':' + config.mongodb.password + '@' : "");

    for (var host in config.mongodb.hosts) {
        mongoUri += config.mongodb.hosts[host];
        if (host < config.mongodb.hosts.length - 1) {
            mongoUri += ",";
        }
    }

    var poolSize = 50;
    mongoUri += "/" + config.mongodb.db + '?poolSize=' + poolSize;
    var mongoOptions = {
        replset: {
            poolSize: poolSize
        },
        db: {
            safe: false
        }
    };

    // Try to setup a mongodb connection, otherwise stopping
    logger.info("cloud-proxy: Trying to connect to mongodb at: " + mongoUri);
    mongoose.connect(mongoUri, function (err) {
        if (err) {
            logger.error("cloud-proxy: Error while connecting from openHAB-cloud to mongodb: " + err);
            process.exit(1);
        } else {
            logger.info("cloud-proxy: Successfully connected to mongodb");
        }
    });

    var mongooseTypes = require("mongoose-types");
    mongooseTypes.loadTypes(mongoose);

    //Create express app
    var app = express();

    // Create http server
    var server = http.createServer(app);

    logger.info('cloud-director: starting express server listening on port ' + port);

    server.listen(port, function () {
        logger.info('cloud-director: express server listening on port ' + port);
    });

    var cookie = {};
    if(config.system.cookie_domain){
      cookie.domain = config.system.cookie_domain;
      cookie.path = '/';
    }
    app.use(express.cookieParser(config.express.key));
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

    app.use(passport.initialize());
    app.use(passport.session());

    //Authorize user or oauth credentials
    app.use(ensureAuthenticated);
    app.use(setOpenhab);
    app.use(redirectRequest);
}

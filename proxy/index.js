var logger = require("../logger.js"),
    cluster = require('cluster'),
    http = require('http'),
    httpProxy = require('http-proxy'),
    flash = require('connect-flash'),
    express = require('express'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    session = require('express-session'),
    RedisStore = require('connect-redis')(session),
    config = require('../config.json'),
    redis = require('../redis-helper')(config.redis),
    mongoose = require('mongoose'),
    User = require('../models/user');

//var numCPUs = require('os').cpus().length;

var numCPUs = 1;

var port = process.env.PORT || 3000;

// If the request contains a bearer token then do oauth2, otherwise try basic auth
var auth = function (req, res, next) {
    if (req.headers.authorization && req.headers.authorization.indexOf('Bearer') === 0) {
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
};

//find a openHAB entry for a given user
var setOpenhab = function(req, res, next) {
    req.user.openhab(function (error, openhab) {
        if (!error && openhab) {
            req.openhab = openhab;
        } else {
            if (error) {
                logger.error("cloud-proxy: openHAB lookup error: " + error);
                return res.status(500).json({
                    errors: [{
                        message: error
                    }]
                });
            } else {
                logger.warn("cloud-proxy: Can't find the openHAB of user which is unbelievable");
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

//proxies a request to a upstream cloud server
var proxyRequest = function (req, res, next) {
    proxy.web(req, res, {
        target: req.openhab.proxyHost,
        ws: true
    });
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

    //Use shared keepAlive agent for proxy requests
    var keepAliveAgent = new http.Agent({
        keepAlive: true
    });

    //Create Proxy server
    var proxy = httpProxy.createProxyServer({
        agent: keepAliveAgent
    });

    //Create express app
    var app = express();

    // Create http server
    var server = http.createServer(app);

    server.listen(port, function () {
        logger.info('cloud-proxy: express server listening on port ' + app.get('port'));
    });

    // Local authentication strategy for passportjs
    passport.use(new LocalStrategy({
            usernameField: 'username'
        },
        function (username, password, done) {
            User.authenticate(username, password, function (err, user, params) {
                // console.log(params);
                return done(err, user, params);
            });
        }));

    passport.serializeUser(function (user, done) {
        done(null, user._id);
    });

    passport.deserializeUser(function (id, done) {
        User.findById(id).cache().exec(function (err, user) {
            done(err, user);
        });
    });

    //Configure express
    app.configure(function () {
        app.use(express.cookieParser(config.express.key));
        app.use(express.session({
            secret: config.express.key,
            store: new RedisStore({
                host: 'localhost',
                port: 6379,
                client: redis,
                logErrors: true
            })
        }));
        app.use(passport.initialize());
        app.use(passport.session());
    });

    //Authorize user or oauth credentials
    app.use(auth,setOpenhab,proxyRequest);
}

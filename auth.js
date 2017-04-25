var passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    BasicStrategy = require('passport-http').BasicStrategy,
    ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy,
    BearerStrategy = require('passport-http-bearer').Strategy,
    OAuth2Client = require('./models/oauth2client'),
    OAuth2Token = require('./models/oauth2token'),
    User = require('./models/user');


// Local authentication strategy for passportjs, used for web logins
passport.use(new LocalStrategy({
        usernameField: 'username'
    },
    function (username, password, done) {
        User.authenticate(username, password, function (err, user, params) {
            return done(err, user, params);
        });
    }));

// standard basic authentication strategy, used for REST based logins
passport.use(new BasicStrategy(
    function (username, password, done) {
        User.authenticate(username, password, function (err, user, params) {
            return done(err, user, params);
        });
    }
));

// authentication strategy used by oauth clients, usess a custom name 'oAuthBasic'
passport.use('oAuthBasic' , new BasicStrategy(
    function (username, password, done) {
        OAuth2Client.findOne({
            clientId: username
        }, function (error, client) {
            if (error) {
                return done(error);
            }
            if (!client) {
                return done(null, false);
            }
            if (client.clientSecret !== password) {
                return done(null, false);
            }
            return done(null, client);
        });
    }
));

// A client-password strategy for authorizing requests for tokens
passport.use(new ClientPasswordStrategy(
    function (clientId, clientSecret, done) {
        OAuth2Client.findOne({
            clientId: clientId
        }, function (error, client) {
            if (error) {
                return done(error);
            }
            if (!client) {
                return done(null, false);
            }
            if (client.clientSecret !== clientSecret) {
                return done(null, false);
            }
            return done(null, client);
        });
    }
));

// A bearer strategy to authorize API requests by oauth2code
passport.use(new BearerStrategy(
    function (accessToken, done) {
        OAuth2Token.findOne({
            token: accessToken
        }, function (error, oauth2token) {
            if (error) {
                return done(error);
            }
            if (!oauth2token) {
                return done(null, false);
            }
            User.findOne({
                _id: oauth2token.user
            }, function (error, openhabUser) {
                if (error) {
                    return done(error);
                }
                if (!openhabUser) {
                    return done(null, false);
                }
                var info = {
                    scope: oauth2token.scope
                };
                done(null, openhabUser, info);
            });
        });
    }
));

passport.serializeUser(function (user, done) {
    done(null, user._id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

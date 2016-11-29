var passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , BasicStrategy = require('passport-http').BasicStrategy
    , ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy
    , BearerStrategy = require('passport-http-bearer').Strategy
    , User = require('./models/user');


// Local authentication strategy for passportjs
passport.use(new LocalStrategy({
        usernameField: 'username'},
    function(username, password, done){
        User.authenticate(username, password, function(err, user, params) {
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

passport.use(new BasicStrategy(
    function(username, password, done) {

    }
));

passport.use(new ClientPasswordStrategy(
    function(clientId, clientSecret, done) {

    }
));

passport.use(new BearerStrategy(
    function(accessToken, done) {

    }
));

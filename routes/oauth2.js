var oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    OAuth2Client = require('../models/oauth2client'),
    OAuth2Code = require('../models/oauth2code'),
    OAuth2Token = require('../models/oauth2token'),
    OAuth2Scope = require('../models/oauth2scope'),
    logger = require('../logger.js'),
    server = oauth2orize.createServer();

// An application must supply serialization functions, which determine how the
// client object is serialized into the session.  Typically this will be a
// simple matter of serializing the client's ID, and deserializing by finding
// the client by ID from the database.

server.serializeClient(function (client, done) {
    return done(null, client._id);
});

server.deserializeClient(function (id, done) {
    OAuth2Client.findOne({
        _id: id
    }, function (error, client) {
        if (error) {
            logger.error('openHAB-cloud: deserializeClient: ' + error);
            return done(error);
        }
        return done(null, client);
    });
});

// Grant authorization codes.  The callback takes the `client` requesting
// authorization, the `redirectURI` (which is used as a verifier in the
// subsequent exchange), the authenticated `user` granting access, and
// their response, which contains approved scope, duration, etc. as parsed by
// the application.  The application issues a code, which is bound to these
// values, and will be exchanged for an access token.

server.grant(oauth2orize.grant.code(function (client, redirectURI, user, ares, done) {
    var code = uid(16),
        newOAuthCode = new OAuth2Code({
        user: user._id,
        oAuthClient: client._id,
        code: code,
        redirectURI: redirectURI,
        scope: ares.scope
    });
    newOAuthCode.save(function (error) {
        if (error) {
            logger.error('openHAB-cloud: server.grant: ' + error);
            return done(error);
        }
        done(null, code);
    });
}));

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

server.exchange(oauth2orize.exchange.code(function (client, code, redirectURI, done) {
    // Instead of finding the code and then checking client and redirectURI match
    // we do all that in a single shot by looking code by code, client and redirectURI
    OAuth2Code.findOne({
        code: code,
        oAuthClient: client._id,
        redirectURI: redirectURI
    }, function (error, oauth2code) {
        if (error) {
            logger.error('openHAB-cloud: server.exchange: ' + error);
            return done(error);
        }
        if (oauth2code === undefined) {
            return done(null, false);
        }
        // Create new token
        var token = uid(256);
        var newOAuthToken = new OAuth2Token({
            token: token,
            user: oauth2code.user,
            oAuthClient: oauth2code.oAuthClient,
            scope: oauth2code.scope
        });
        newOAuthToken.save(function (error) {
            if (error) {
                return done(error);
            }
            // Invalidate access code which was exchanged for token
            oauth2code.valid = false;
            oauth2code.save(function (error) {
                if (error) {
                    return done(error);
                }
                done(null, token);
            });
        });
    });
}));

exports.authorization = [
    server.authorization(function (clientId, redirectURI, done) {
        OAuth2Client.findOne({
            clientId: clientId
        }, function (error, client) {
            if (error) {
                logger.error('openHAB-cloud: server.authorization ' + error);
                return done(error);
            }

            return done(null, client, redirectURI);
        });
    }),
    function (req, res) {
        var errormessages,
            infomessages,
            scope;

        errormessages = req.flash('error');
        infomessages = req.flash('info');
        scope = req.oauth2.req.scope;
        logger.info('openHAB-cloud: server.authorization oauth2 request for scope: ' + scope);
        OAuth2Scope.findOne({
            name: scope
        }, function (error, scope) {
            if (error) {
                req.flash('error', 'There was an error while processing your request');
                res.redirect('/');
            } else if (!scope) {
                req.flash('info', 'The application requested access to unknown scope');
                res.redirect('/');
            } else {
                res.render('oauth2dialog', {
                    title: 'openHAB',
                    user: req.user,
                    errormessages: errormessages,
                    infomessages: infomessages,
                    transactionID: req.oauth2.transactionID,
                    oauthClient: req.oauth2.client,
                    scope: scope
                });
            }
        });
    }
];

exports.decision = [
    server.decision(function (req, done) {
        return done(null, {
            scope: req.oauth2.req.scope
        });
    })
];

exports.token = [
    passport.authenticate(['oAuthBasic', 'oauth2-client-password'], {
        session: false
    }),
    server.token(),
    server.errorHandler()
];

/**
 * Return a unique identifier with the given `len`.
 *
 *     utils.uid(10);
 *     // => 'FDaS435D2z'
 *
 * @param {Number} len
 * @return {String}
 * @api private
 */

function uid(len) {
    var buf = [],
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        charlen = chars.length;

    for (var i = 0; i < len; ++i) {
        buf.push(chars[getRandomInt(0, charlen - 1)]);
    }

    return buf.join('');
}

/**
 * Return a random int, used by `utils.uid()`
 *
 * @param {Number} min
 * @param {Number} max
 * @return {Number}
 * @api private
 */

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

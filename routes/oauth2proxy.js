var oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    http = require('node:http'),
    net = require('node:net'),
    OAuth2Client = require('../models/oauth2client'),
    OAuth2Code = require('../models/oauth2code'),
    OAuth2Token = require('../models/oauth2token'),
    OAuth2Scope = require('../models/oauth2scope'),
    OAuth2Relay = require('../models/oauth2relay'),
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
    console.log('==================== server.grant called');
    console.log('client: ' + client);  
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
            logger.error('server.grant: ' + error);
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

server.exchange(oauth2orize.exchange.clientCredentials(function(client, scope, done) {
    console.log('clientId: ' + client);
    console.log('clientId: ' + client.clientId);
    console.log('clientSecret: ' + client.clientSecret);
    console.log('scope: ' + scope);


    var token = "";
    var expiresIn = 1800;
    var expirationDate = new Date(new Date().getTime() + (expiresIn * 1000))
    var scope = "";
    var tokenType = "";


    OAuth2Relay.findOne({
        name: client.name
    }, function (error, relay) {
        if (error) {
            return done(error);
        } else if (!relay) {
            return done("can't find relay");
        } else {
            console.log('relay:' + relay);

            var https = require('https');
            const options = {
                host: relay.targetHost,
                port: 443,
                path: relay.targetTokenUrl,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': '*',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            // Make a request
            var req2 = https.request(options, function(res2) {
                res2.setEncoding('utf8');
                res2.on('data', function (chunk) {
                    json = JSON.parse(chunk)

                    token = json.access_token;
                    scope = json.scope;
                    tokenType = json.token_type;
                    expiresIn = json.expires_in;

                    return done(null, token, {expires_in: expiresIn, token_type: tokenType, scope:scope});
                });
            });
            
            req2.on('error', function(e) {
                console.log('problem with request: ' + e.message);
            });
            
            // write data to request body
            var clientId = relay.clientId;
            var clientSecret = relay.clientSecret;
            req2.write('client_id=' + clientId + '&client_secret=' + clientSecret + '&grant_type=client_credentials');
            req2.end();
        }
    });
}));



exports.authorization = [
        server.authorization(function (clientId, redirectURI, done) {
        console.log('==================== server.authorization called');
        console.log('clientId: ' + clientId);
        console.log('redirectURI: ' + redirectURI);

        OAuth2Client.findOne({
                        clientId: clientId
                    }, function (error, client) {
                        if (error) {
                            return done(error);
                        }

                        return done(null, client, redirectURI);
                    });
        }),
        function (req, res) {
            var errormessages,
                        infomessages,
                        scope,
                        relay;
            
            errormessages = req.flash('error');
            infomessages = req.flash('info');
            scope = req.oauth2.req.scope;
            console.log('server.authorization oauth2 request for scope: ' + scope);
            relay = scope;

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
                            console.log('relay:' + relay);
                            console.log('scope:' + scope);
                            OAuth2Relay.findOne({
                                name: relay
                            }, function (error, relay) {
                                if (error) {
                                    req.flash('error', 'There was an error while processing your request');
                                    res.redirect('/');
                                } else if (!relay) {
                                    req.flash('info', 'The application requested access to unknown scope');
                                    res.redirect('/');
                                } else {
                                    var redirectUri = relay.targetAuthorizeUrl;

                                    redirectUri = redirectUri + "?duration=P36M";
                                    redirectUri = redirectUri + "&response_type=code";
                                    redirectUri = redirectUri + "&client_id=" + relay.clientId;
                                    redirectUri = redirectUri + "&scope=" + "am_application_scope+default";
                                    
                                    logger.debug('redirectUri:' + redirectUri);
                                    res.redirect(redirectUri);
                                }
                            });
                    
                            
                        }});
    }
];

exports.decision = [
    server.decision(function (req, done) {
        console.log('==================== server.decision called');
        return done(null, {
            scope: req.oauth2.req.scope
        });
    })
];

exports.token = 
[
    passport.authenticate(['oauth2-client-password', 'oAuthBasic'], { session: false }),
    server.token(),
    server.errorHandler()    
];


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
            logger.error('deserializeClient: ' + error);
            return done(error);
        }
        return done(null, client);
    });
});

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.


exports.authorization = 
    function (req, res) {
        var errormessages,
            infomessages,
            relay;

        errormessages = req.flash('error');
        infomessages = req.flash('info');
        relay = "Enedis";
        logger.info('server.authorization oauth2 request for scope: ' + relay);
        
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
                redirectUri = redirectUri + "&state=" + "linky";
                redirectUri = redirectUri + "&scope=" + "am_application_scope+default";
                
                logger.debug('redirectUri:' + redirectUri);
                res.redirect(redirectUri);
            }
        });
        
    };



exports.token = 
    function (req, res) {
        var errormessages,
        infomessages,
        relay;

        errormessages = req.flash('error');
        infomessages = req.flash('info');
        
        relay = "Enedis";

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
                var https = require('https');
                const options = {
                host: 'ext.prod.api.enedis.fr',
                port: 443,
                path: '/oauth2/v3/token',
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': '*',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
                };

                // Make a request
                var req2 = https.request(options, function(res2) {
                    console.log('STATUS: ' + res2.statusCode);
                    console.log('HEADERS: ' + JSON.stringify(res2.headers));
                    res2.setEncoding('utf8');
                    res2.on('data', function (chunk) {
                    console.log('BODY: ' + chunk);
                    res.status(200).end(chunk);
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
    };



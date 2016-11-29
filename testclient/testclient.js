
// configuration
// baseurl - the url of the openhab instance
var baseurl = "https://localhost:843";
// uuid - uuid of openhab
var uuid = '00000000-0000-0000-0000-000000000000';
// secret - secret key of openhab
var secret = 'secretsecret';
// openhab folder
var openhabfolder = '/Users/user/apps/openhab.demo/configurations';

// app starts here
var io = require('socket.io-client');
var request = require('request');
var https = require('https');
var url = require("url");
var chokidar = require('chokidar');
var path = require('path');
var fs = require('fs');

https.globalAgent.options.rejectUnauthorized = false;
var agent = new https.Agent()
agent.maxSockets = 100;
agent.options.rejectUnauthorized = false;
var activeRequests = {};

var socketUrl = 'https://myopenhab.org?uuid=' + uuid + '&secret=' + secret;
console.log('Connecting to socket');
socket = io.connect(socketUrl, {});

var watcher = chokidar.watch(openhabfolder, {ignored: function(_path) {
    if (_path == openhabfolder)
        return false;
    _path = _path.replace(openhabfolder, '');
//    console.log(_path);
    if (_path.match(/\/(items|sitemaps|rules|scripts|transform|persistence)$/))
        return false;
    else
        return !_path.match(/\.(items|sitemap|rules|script|xsl|map|cfg)$/);
}, persistent: true});
watcher
    .on('all', function(event, _path) {
//        console.log(event + " " + _path.replace(openhabfolder, ''));
        filepath = _path.replace(openhabfolder, '');
        filename = path.basename(filepath);
        filemodified = fs.statSync(_path)['mtime'];
        if (filepath.match(/openhab.cfg$/))
            console.log(event + " openHAB Config " + filename + " " + filemodified);
        else if (filepath.match(/^\/items\//))
            console.log(event + " items file " + filename + " " + filemodified);
        else if (filepath.match(/^\/sitemaps\//))
            console.log(event + " sitemap file " + filename + " " + filemodified);
        else if (filepath.match(/^\/scripts\//))
            console.log(event + " script file " + filename + " " + filemodified);
        else if (filepath.match(/^\/transform\//))
            console.log(event + " transformation file " + filename + " " + filemodified);
        else if (filepath.match(/^\/rules\//))
            console.log(event + " items file " + filename + " " + filemodified);
    });

socket.on('connect', function () {
    console.log("Websocket connected");
    socket.on('request', function(data) {
        var requestData = data;
        var requestUrl = url.parse(baseurl + requestData.path);
        requestUrl.query = requestData.query;
/*        url = url + "?"
        for (var key in requestData.query) {
            url = url + key + "=" + requestData.query[key] + "&";
        }*/
        console.log("Sending request id " + requestData.id + " to " + url.format(requestUrl));
        var requestSettings = {
            url: url.format(requestUrl),
            method: requestData.method,
            headers: requestData.headers,
            body: requestData.body,
            strictSSL: true,
            timeout: 600000,
            agent: agent,
            encoding: null
        };
        console.log(requestData.headers);
        rrr = request(requestSettings, function(error, response, body) {
            if (!error) {
                console.log("Got http response for request " + requestData.id);
                console.log(response.statusCode);
                console.log(response.headers);
                var responseBody = body || new Buffer("", 'binary');
                socket.emit('response', {id: requestData.id, responseStatusCode: 200, headers: response.headers, body: responseBody.toString('base64')});
            } else {
                console.log("Request error for request " + requestData.id);
                console.log(error);
                socket.emit('response', {id: requestData.id, error: error});
            }
        });
        activeRequests[requestData.id] = rrr;
    });
    socket.on('cancel', function(data) {
        var requestData = data;
        console.log("Canceling request " + requestData.id);
        if (activeRequests[requestData.id] != null) {
            console.log("Found active request, cancelling");
            activeRequests[requestData.id].end();
            delete activeRequests[requestData.id];
        }
    });
});
socket.on('error', function(error) {
    console.log(error);
});


// socket.emit('private message', { user: 'me', msg: 'whazzzup?' });

var io = require('socket.io-client');
var mongoose = require('mongoose')
    , logger = require('../logger.js');
var Openhab = require('../models/openhab');

var testSockets = {};

mongoose.connect('mongodb://test:test@localhost/openhab', function(error) {
    if (error) {
        logger.error("mongo connection error: " + error);
    } else {
        logger.info("openHAB-cloud connected to mongodb");
        Openhab.find({}).limit(200).exec(function(error, testOpenhabs) {
            if (error) {
                logger.error("error getting openhabs: " + error);
            } else {
                logger.info("connecting test openhab sockets");
                for (testOpenhabId in testOpenhabs) {
                    var testOpenhab = testOpenhabs[testOpenhabId];
                    console.log(testOpenhab);
                    var newSocket = io.connect('http://localhost:3000', {query: "uuid=" + testOpenhab.uuid +
                    "&secret=" + testOpenhab.secret, forceNew: true});
                    newSocket.on('binaryTest', function(data) {
                        console.log(data);
                    });
                    testSockets[testOpenhab.uuid] = newSocket;
                }
                logger.info("starting connect/disconnect cycle");
                setInterval(function() {
                    for (testOpenhabId in testOpenhabs) {
                        var testOpenhab = testOpenhabs[testOpenhabId];
                        if (testSockets[testOpenhab.uuid] != null) {
                            testSockets[testOpenhab.uuid].emit('itemupdate', { itemName: 'TestItem1', itemStatus: '100' });
                            // Randomly disconnect
                            if (Math.random() <= 0.2) {
                                testSockets[testOpenhab.uuid].disconnect();
                                delete testSockets[testOpenhab.uuid];
                            }
                        } else {
                            // Randomly reconnect
                            if (Math.random() > 0.2) {
                                var newSocket = io.connect('http://localhost:3000', {
                                    query: "uuid=" + testOpenhab.uuid +
                                    "&secret=" + testOpenhab.secret, forceNew: true
                                });
                                newSocket.on('binaryTest', function(data) {
                                    console.log(data);
                                });
                                testSockets[testOpenhab.uuid] = newSocket;
                            }
                        }
                    }
                    Openhab.count({status:"online"}, function(error, onlineCount) {
                        Openhab.count({status:"offline"}, function(error, offlineCount) {
                            logger.info("Tick: sockets count = " + Object.keys(testSockets).length +
                                ", online = " + onlineCount + ", offline = " + offlineCount);
                        });
                    });
                }, 10000);
            }
        });
    }
});

var logger = require('./logger.js'),
    redis = require('./redis-helper'),
    uuid = require('uuid'),
    requesttracker = require('./requesttracker'),
    appleSender = require('./notificationsender/aps-helper'),
    firebase = require('./notificationsender/firebase'),
    config = require('./config.json'),
    User = require('./models/user'),
    Openhab = require('./models/openhab'),
    Event = require('./models/event'),
    UserDevice = require('./models/userdevice'),
    Notification = require('./models/notification');


/**
 * Socket.IO Logic for incoming openHAB servers
 * @param {*} server 
 * @param {*} system 
 */
function SocketIO(server, system) {
    const internalAddress = system.getInternalAddress();
    var requestTracker = new requesttracker();
    var io = require('socket.io')(server, {
        maxHttpBufferSize: 1e8, //100mb, this was a previous default in engine.io before the upgrade to 3.6.0 which sets it to 1mb.  May want to revisit.
        logger: logger
    });

    this.io = io;
    this.requestTracker = requestTracker;

    /** Socket.io Routes **/

    //Check if we have blocked this connection
    io.use(function (socket, next) {
        const uuid = socket.handshake.query['uuid'] || socket.handshake.headers['uuid'];
        if (uuid) {
            redis.ttl('blocked:' + uuid, (err, result) => {
                if (err) {
                    logger.info('blocked: error talking with redis for %s %s', uuid, err);
                    next();
                } else {
                    switch (result) {
                        case -2: // key does not exist
                            next();
                            break;
                        case -1: // key exists but no TTL
                            next(new Error('your connection is blocked'));
                            break;
                        default: // seconds left on TTL
                            next(new Error(`try again in ${result} seconds`));
                            break;
                    }
                }

            })
        } else {
            next(new Error('missing uuid'));
        }
    });

    //Socket.io Handshake, this is during the initial http request, before the connection is upgraded to a websocket
    io.use(function (socket, next) {
        const handshakeData = socket.handshake;
        const handshakeSecret = handshakeData.headers['secret'];
        handshakeData.uuid = handshakeData.headers['uuid'];
        handshakeData.openhabVersion = handshakeData.headers['openhabversion'] || 'unknown'

        logger.info('Authorizing incoming openHAB connection for %s version %s', handshakeData.uuid, handshakeData.openhabVersion);
        Openhab.findOne({
            uuid: handshakeData.uuid,
            secret: handshakeSecret
        }, function (error, openhab) {
            if (error) {
                logger.error('openHAB lookup error: %s', error);
                next(error);
            } else {
                if (openhab) {
                    socket.openhab = openhab; // will use this reference in 'connect' to save on mongo calls
                    socket.openhabId = openhab.id;
                    next();
                } else {
                    logger.info('openHAB %s not found', handshakeData.uuid);
                    redis.set('blocked:' + handshakeData.uuid, handshakeData.openhabVersion, 'NX', 'EX', 60, (error, result) => {
                        if (error) {
                            logger.info('setting blocked: error talking with redis for %s %s ', handshakeData.uuid, error);
                        }
                        next(new Error('not authorized'));
                    });
                }
            }
        });
    });

    //Authentication has succeeded, try and obtain a Redis Lock
    io.use(function (socket, next) {
        socket.connectionId = uuid.v1(); //we will check this when we handle disconnects
        logger.info('obtaining lock for connection for uuid %s and connectionId %s', socket.handshake.uuid, socket.connectionId);
        socket.redisLockKey = 'connection:' + socket.openhab.id;
        const redisLockValue = {
            serverAddress: internalAddress,
            connectionId: socket.connectionId,
            connectionTime: new Date().toISOString(),
            openhabVersion: socket.handshake.openhabVersion
        }
        //Try obtaining a lock using the NX option, see see https://github.com/redis/node-redis/tree/v3.1.2#optimistic-locks
        redis.set(socket.redisLockKey, JSON.stringify(redisLockValue), 'NX', 'EX', system.getConnectionLockTimeSeconds(), (error, result) => {
            if (error) {
                logger.info('error attaining connection lock for uuid %s connectionId %s %s', socket.handshake.uuid, socket.connectionId, error);
                return next(new Error('connection lock error'));
            }

            if (!result) {
                //this key already exists, which means another connection exists
                logger.info('another connection has lock for uuid %s my connectionId %s', socket.handshake.uuid, socket.connectionId);
                return next(new Error('already connected'));
            }
            next();
        });
    });

    //A valid websocket connection has been established
    io.sockets.on('connection', function (socket) {
        logger.info('connection success for uuid %s connectionId %s', socket.handshake.uuid, socket.connectionId);
        socket.join(socket.handshake.uuid);
        saveConnectionEvent(socket.openhab, 'online', 'good');

        //listen for pings from the client
        socket.conn.on('packet', function (packet) {
            if (packet.type === 'ping') {
                //reset the expire time on our lock
                //When we upgrade redis we can replace multi with getex
                //redis.getex(socket.redisLockKey, "EX", system.getConnectionLockTimeSeconds(), (error, result) => {
                redis.multi()
                    .expire(socket.redisLockKey, system.getConnectionLockTimeSeconds())
                    .get(socket.redisLockKey)
                    .exec((error, result) => {
                        if (!result || !result[1]) {
                            if (error) {
                                logger.error('ping: error updating lock expire for uuid %s connectionId %s %s', socket.handshake.uuid, socket.connectionId, error);
                                return;
                            } else {
                                logger.error('ping: lock no longer present for uuid %s connectionId %s result %s key %s', socket.handshake.uuid, socket.connectionId, result, socket.redisLockKey);
                            }
                            //we have lost our lock, something has gone wrong, lets cleanup
                            socket.disconnect();
                            return;
                        }
                        const connection = JSON.parse(result[1]);
                        if (connection.connectionId !== socket.connectionId) {
                            logger.error('ping: connection %s has a lock for uuid %s, my connectionId %s', connection.connectionId, socket.handshake.uuid, socket.connectionId);
                            //we have lost our lock, something has gone wrong, lets cleanup
                            socket.disconnect();
                        }
                    });
            };
        });

        socket.on('disconnect', function () {
            logger.info('Disconnected uuid %s connectionId %s', socket.handshake.uuid, socket.connectionId);

            //watch the current key to avoid race conditions with another connection replacing it
            //see https://github.com/redis/node-redis/tree/v3.1.2#optimistic-locks
            redis.watch(socket.redisLockKey, function (error) {
                if (error) {
                    logger.info('error obtaining watch to delete for uuid %s connectionId %s error %s', socket.openhab.uuid, socket.connectionId, error);
                    return;
                }
                //make sure this is our connection id, and not a healthy reconnection from the same client 
                redis.get(socket.redisLockKey, (error, result) => {
                    var connection = result ? JSON.parse(result) : null;
                    if (!connection || connection.connectionId !== socket.connectionId) {
                        if (error) {
                            logger.info('error getting connection lock to remove for uuid %s connectionId %s error %s', socket.openhab.uuid, socket.connectionId, error);
                        } else {
                            logger.info('lock already removed, or not our ID for uuid %s connectionId %s, lock: %s', socket.openhab.uuid, socket.connectionId, connection);
                        }
                        //make sure to unwatch if we abort before the `multi.exec` which will unwatch automatically
                        redis.unwatch();
                        return;
                    }

                    redis.multi()
                        .del(socket.redisLockKey)
                        .exec(function (error, results) {
                            if (!results) {
                                if (error) {
                                    logger.info('error removing connection lock for uuid %s connectionId %s error %s', socket.openhab.uuid, socket.connectionId, error);
                                } else {
                                    //the key changed before we could delete it
                                    logger.info('lock mutated before delete for uuid %s connectionId %s', socket.openhab.uuid, socket.connectionId);
                                }
                            }
                        });

                    //would be nice to remove this
                    Openhab.setLastOnline(socket.openhab.id, err => {
                        if (err) {
                            logger.error("error saving lastonline %s", err);
                        } else {
                            saveConnectionEvent(socket.openhab, 'offline', 'bad');
                        }
                    });
                });
            });
        });
        socket.on('responseHeader', function (data) {
            var self = this;
            var requestId = data.id,
                request;
            if (requestTracker.has(requestId)) {
                request = requestTracker.get(requestId);
                if (self.handshake.uuid === request.openhab.uuid && !request.headersSent) {
                    request.writeHead(data.responseStatusCode, data.responseStatusText, data.headers);
                } else {
                    logger.warn('responseHeader %s tried to respond to request which it doesn\'t own %s or headers have already been sent', self.handshake.uuid, request.openhab.uuid);
                }
            } else {
                self.emit('cancel', {
                    id: requestId
                });
            }
        });
        socket.on('responseContentBinary', function (data) {
            var self = this;
            var requestId = data.id,
                request;
            if (requestTracker.has(requestId)) {
                request = requestTracker.get(requestId);
                if (self.handshake.uuid === request.openhab.uuid) {
                    request.write(data.body);
                } else {
                    logger.warn('responseContentBinary %s tried to respond to request which it doesn\'t own %s', self.handshake.uuid, request.openhab.uuid);
                }
            } else {
                self.emit('cancel', {
                    id: requestId
                });
            }
        });
        socket.on('responseFinished', function (data) {
            var self = this;
            var requestId = data.id,
                request;
            if (requestTracker.has(requestId)) {
                request = requestTracker.get(requestId);
                if (self.handshake.uuid === request.openhab.uuid) {
                    request.end();
                } else {
                    logger.warn('responseFinished %s tried to respond to request which it doesn\'t own %s', self.handshake.uuid, request.openhab.uuid);
                }
            }
        });
        socket.on('responseError', function (data) {
            var self = this;
            var requestId = data.id,
                request;
            if (requestTracker.has(requestId)) {
                request = requestTracker.get(requestId);
                if (self.handshake.uuid === request.openhab.uuid) {
                    request.send(500, data.responseStatusText);
                } else {
                    logger.warn('responseError %s tried to respond to request which it doesn\'t own %s', self.handshake.uuid, request.openhab.uuid);
                }
            }
        });
        socket.on('notification', function (data) {
            var self = this;
            logger.info('Notification request from %s to user %s', self.handshake.uuid, data.userId);
            User.findOne({
                username: data.userId
            }, function (error, user) {
                if (error) {
                    logger.error('User lookup error: %s', error);
                    return;
                }
                if (!user) {
                    return;
                }
                user.openhab(function (error, openhab) {
                    if (!error && openhab) {
                        if (openhab.uuid === self.handshake.uuid) {
                            logger.info('Notification from %s to %s', self.handshake.uuid, user.username);
                            sendNotificationToUser(user, data.message, data.icon, data.severity);
                        } else {
                            logger.warn('openHAB %s requested notification for user (%s) which it does not belong to', self.handshake.uuid, user.username);
                        }
                    } else {
                        if (error) {
                            logger.error('openHAB lookup error: %s', error);
                        } else {
                            logger.warn('Unable to find openHAB for user %s', user.username);
                        }
                    }
                });
            });
        });
        socket.on('broadcastnotification', function (data) {
            Openhab.findById(this.openhabId, function (error, openhab) {
                if (error) {
                    logger.error('openHAB lookup error: %s', error);
                    return;
                }
                if (!openhab) {
                    logger.debug('openHAB not found');
                    return;
                }

                User.find({
                    account: openhab.account
                }, function (error, users) {
                    if (error) {
                        logger.error('Error getting users list: %s', error);
                        return;
                    }

                    if (!users) {
                        logger.debug('No users found for openHAB');
                        return;
                    }

                    for (var i = 0; i < users.length; i++) {
                        sendNotificationToUser(users[i], data.message, data.icon, data.severity);
                    }
                });
            });
        });
        socket.on('lognotification', function (data) {
            Openhab.findById(this.openhabId, function (error, openhab) {
                if (error) {
                    logger.error('openHAB lookup error: %s', error);
                    return;
                }
                if (!openhab) {
                    logger.debug('openHAB not found');
                    return;
                }
                User.find({
                    account: openhab.account
                }, function (error, users) {
                    if (error) {
                        logger.error('Error getting users list: %s', error);
                        return;
                    }

                    if (!users) {
                        logger.debug('No users found for openHAB');
                        return;
                    }

                    for (var i = 0; i < users.length; i++) {
                        newNotification = new Notification({
                            user: users[i].id,
                            message: data.message,
                            icon: data.icon,
                            severity: data.severity
                        });
                        newNotification.save(function (error) {
                            if (error) {
                                logger.error('Error saving notification: %s', error);
                            }
                        });
                    }
                });
            });
        });
    });

    function saveConnectionEvent(openhab, status, color) {
        var connectevent = new Event({
            openhab: openhab.id,
            source: 'openhab',
            status: status,
            color: color
        });
        connectevent.save(function (error) {
            if (error) {
                logger.error('Error saving connect event: %s', error);
            }
        });
    }

    /**
     * When we move events to redis, use this instead of mongo
     */
    function saveConnectionEventRedis(openhab, status, color) {
        //move to config
        const eventTTL = 60 * 60 * 24 * 14; // 14 days
        const date = new Date();
        const eventKey = 'events:' + openhab.id;
        const event = {
            source: 'openhab',
            status: status,
            color: color,
            when: date.toISOString()
        }
        //add event, reset expire time for 14 days, remove any events older then 14 days
        redis.multi()
            .zadd(eventKey, date.getTime(), JSON.stringify(event))
            .expire(eventKey, eventTTL)
            .zremrangebyscore(eventKey, '-inf', date.getTime() - (eventTTL * 1000))
            .exec((error, reply) => {
                if (error) {
                    logger.error('Could not modify events: %s', error)
                }
            });
    }

    function sendNotificationToUser(user, message, icon, severity) {
        var androidRegistrations = [];
        var iosDeviceTokens = [];
        var newNotification = new Notification({
            user: user.id,
            message: message,
            icon: icon,
            severity: severity
        });
        newNotification.save(function (error) {
            if (error) {
                logger.error('Error saving notification: %s', error);
            }
        });
        UserDevice.find({
            owner: user.id
        }, function (error, userDevices) {
            if (error) {
                logger.warn('Error fetching devices for user: %s', error);
                return;
            }
            if (!userDevices) {
                // User don't have any registered devices, so we will skip it.
                return;
            }

            for (var i = 0; i < userDevices.length; i++) {
                if (userDevices[i].deviceType === 'android') {
                    androidRegistrations.push(userDevices[i].androidRegistration);
                } else if (userDevices[i].deviceType === 'ios') {
                    iosDeviceTokens.push(userDevices[i].iosDeviceToken);
                }
            }
            // If we found any android devices, send notification
            if (androidRegistrations.length > 0) {
                firebase.sendNotification(androidRegistrations, newNotification);
            }
            // If we found any ios devices, send notification
            if (iosDeviceTokens.length > 0) {
                sendIosNotifications(iosDeviceTokens, newNotification);
            }
        });
    }

    function sendIosNotifications(iosDeviceTokens, notification) {
        if (!config.apn) {
            return;
        }
        var payload = {
            severity: notification.severity,
            icon: notification.icon,
            persistedId: notification._id,
            timestamp: notification.created.getTime()
        };
        for (var i = 0; i < iosDeviceTokens.length; i++) {
            appleSender.sendAppleNotification(iosDeviceTokens[i], notification.message, payload);
        }
    }

    //cancel restRequests that have become orphaned.  For some reason neither close
    //nor finish is being called on some response objects and we end up hanging on
    //to these in our restRequests map.  This goes through and finds those orphaned
    //responses and cleans them up, otherwise memory goes through the roof.
    setInterval(function () {
        var requests = requestTracker.getAll();
        logger.debug('Checking orphaned rest requests (%d)', requestTracker.size());
        Object.keys(requests).forEach(function (requestId) {
            var res = requests[requestId];
            if (res.finished) {
                logger.debug('expiring orphaned response');
                requestTracker.remove(requestId);
                if (res.openhab) {
                    io.sockets.in(res.openhab.uuid).emit('cancel', {
                        id: requestId
                    });
                }
            }
        })
    }, 60000);
}

module.exports = SocketIO;
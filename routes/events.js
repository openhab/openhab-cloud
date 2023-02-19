var User = require('../models/user');
var Openhab = require('../models/openhab');
var Event = require('../models/event');
var logger = require('../logger');

/**
 * When we move events to redis, use this
 * 
 * const eventKey = 'events:' + req.openhab.id;
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
        redis.zcount(eventKey,'-inf','+inf', (error, count) => {
            logger.debug('zrange %s %d %d',eventKey, perPage * page, perPage);
            redis.zrange(eventKey, perPage * page, perPage, (error, result) => {
                logger.debug('events for key %s : %s', eventKey, events);
                res.render('events', { events: events, pages: count / perPage, page: page,
                title: "Events", user: req.user, source: req.query.source,
                errormessages:req.flash('error'), infomessages:req.flash('info') });
            });
        });
 */

exports.eventsget = function(req, res) {
    var perPage = 20,
        page = req.query.page > 0 ? parseInt(req.query.page) : 0;
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            var filter = {openhab: openhab};
            if (req.query.source)
                filter.source = req.query.source;
            Event.find(filter)
                .limit(perPage)
                .skip(perPage * page)
                .sort({when: 'desc'})
                .lean()
                .exec(function(error, events) {
                    Event.count().exec(function (err, count) {
                        res.render('events', { events: events, pages: count / perPage, page: page,
                            title: "Events", user: req.user, openhab: openhab, source: req.query.source,
                            errormessages:req.flash('error'), infomessages:req.flash('info') });
                    });
                });
        } else {

        }
    });
}

exports.eventsvaluesget = function(req, res) {
    req.user.openhab(function(error, openhab) {
        if (!error && openhab != null) {
            var filter = {openhab: openhab, source: req.query.source};
            Event.find(filter).sort({when: 'asc'}).select('when status -_id').exec(function(error, events) {
                if (!error) {
                    var result = [];
                    var startTime = parseInt(events[0].when.getTime()/1000);
                    for (var i=0; i<events.length; i++) {
                        var event = events[i];
                        result.push([parseInt(event.when.getTime()/1000)-startTime, parseFloat(event.status)]);
                    }
                    res.send(JSON.stringify(result));
                }
            });
        }
    });
}

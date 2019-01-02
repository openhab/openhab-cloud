const eventModel = require("../../../../models/event");
const userModel = require("../../../../models/user");
const openhabModel = require("../../../../models/openhab");
const eventRoute = require("../../../../routes/events");
const sinon = require("sinon");
const mockReq = require ('sinon-express-mock').mockReq;
const mockRes = require ('sinon-express-mock').mockRes;
require('sinon-mongoose');
const chai = require('chai');


describe('Unit test Event routes', function () {

    describe('Get Events', function () {

        var createdEvent = new eventModel({
            openhab: 1,
            source: 'openhab',
            status: 'offline',
            color: 'bad',
            when: Date.now()
        });

        var userMock;
        var openhabMock;
        var eventMock;

        beforeEach(function () {
            openhabMock = sinon.mock(openhabModel)
                .expects('findOne')
                .yields(null, "OPENHAB");
            eventMock = sinon.mock(eventModel);
            eventMock
                .expects('find')
                .withArgs()
                .chain('exec')
                .yields(null, [createdEvent]);
            userMock = sinon.mock(userModel);
            userMock.openhab = openhabMock;
        });

        afterEach(function () {
            eventMock.restore();
            openhabMock.restore();
            userMock.restore();
        });


        it('expect correct page with events', function () {
            var res = mockRes();
            var req = {};
            req.params = {'page' : 20};
            req.user = userMock;
            eventRoute.eventsget(req, res);
            eventMock.verify();
        });

        it('expect correct events value', function () {
            var res = mockRes();
            var req = {};
            req.params = {'source' : 20};
            req.user = userMock;
            eventRoute.eventsvaluesget(req, res);
            eventMock.verify();
        });
    });
});


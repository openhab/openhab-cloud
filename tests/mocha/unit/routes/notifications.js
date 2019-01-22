const notificationsModel = require("../../../../models/notification");
const userModel = require("../../../../models/user");
const openhabModel = require("../../../../models/openhab");
const  notificationsRoute = require("../../../../routes/notifications");
const sinon = require("sinon");
require('sinon-mongoose');
const chai = require('chai');


describe('Unit test notifications routes', function () {

    describe('Get notifications', function () {

        var notificationMock;
        var userMock;
        var openhabMock;

        beforeEach(function () {
            notificationMock = sinon.mock(notificationsModel);
            notificationMock
                .expects('find')
                .chain('exec')
                .yields(null, notificationMock);

            openhabMock = sinon.mock(openhabModel)
                .expects('findOne')
                .yields(null, "OPENHAB");
            userMock = sinon.mock(userModel);
            userMock.openhab = openhabMock;
        });

        afterEach(function () {
            openhabMock.restore();
            notificationMock.restore();
            userMock.restore();
        });

        it('expect correct page with notifications', function (done) {
            var req,res;
            var req = res = {};
            req.params = {'page' : 20};
            req.user = userMock;
            notificationsRoute.notificationsget(req, res);
            notificationMock.verify();
            done();
        });
    });
});

const notificationsModel = require("../../../../models/notification");
const userModel = require("../../../../models/user");
const openhabModel = require("../../../../models/openhab");
const apiRoute = require("../../../../routes/api");
const sinon = require("sinon");
const mockReq = require('sinon-express-mock').mockReq;
const mockRes = require('sinon-express-mock').mockRes;
require('sinon-mongoose');
const chai = require('chai');


describe('Unit API routes', function () {

    describe('Get Notifications', function () {

        var notificationMock;

        notificationStub = new notificationsModel({
            user: 1,
            message: "Message",
            icon: "Icon",
            severity: "Severity"
        });


        it('Expect json with correct data', function () {
            var res = mockRes();
            var body = {};
            body.params = {limit: 20, skip: 0};
            body.user = {id: 1};
            var req = mockReq(body);
            notificationMock = sinon.mock(notificationsModel);
            notificationMock
                .expects('find')
                .chain('exec')
                .yields(null, [notificationStub]);
            apiRoute.notificationsget(req, res);
            notificationMock.verify();
        });

        it('Expect 500 if error data', function () {
            var res = mockRes();
            var body = {};
            body.params = {limit: 20, skip: 0};
            body.user = {id: 1};
            var req = mockReq(body);
            notificationMock = sinon.mock(notificationsModel);
            notificationMock
                .expects('find')
                .chain('exec')
                .yields("error", "");
            apiRoute.notificationsget(req, res);
            notificationMock.verify();
        });
    });
});


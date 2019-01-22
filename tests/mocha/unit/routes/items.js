const itemModel = require("../../../../models/item");
const userModel = require("../../../../models/user");
const openhabModel = require("../../../../models/openhab");
const itemsRoute = require("../../../../routes/items");
const sinon = require("sinon");
require('sinon-mongoose');
const mockReq = require ('sinon-express-mock').mockReq;
const mockRes = require ('sinon-express-mock').mockRes;
const chai = require('chai');


describe('Unit test items routes', function () {

    describe('Get Items', function () {

        var itemMock;
        var userMock;
        var openhabMock;

        beforeEach(function () {
            openhabMock = sinon.mock(openhabModel)
                .expects('findOne')
                .yields(null, "OPENHAB");
            itemMock = sinon.mock(itemModel);
            itemMock
                .expects('find')
                .withArgs()
                .chain('exec')
                .yields(null, "");
            userMock = sinon.mock(userModel);
            userMock.openhab = openhabMock;
        });

        afterEach(function () {
            userMock.restore();
            openhabMock.restore();
            itemMock.restore();
        });

        it('expect correct page with items sorted by name', function (done) {
            var res = mockRes();
            var body = {};
            body.params = {'sort' : 'name'};
            body.user = userMock;
            var req = mockReq(body);
            itemsRoute.itemsget(req, res);
            itemMock.verify();
            done();
        });

        it('expect correct page with items sorted by last_update', function (done) {
            var res = mockRes();
            var body = {};
            body.params = {'sort' : 'last_update'};
            body.user = userMock;
            var req = mockReq(body);
            itemsRoute.itemsget(req, res);
            itemMock.verify();
            done();
        });

        it('expect correct page with items sorted by status', function (done) {
            var res = mockRes();
            var body = {};
            body.params = {'sort' : 'status'};
            body.user = userMock;
            var req = mockReq(body);
            itemsRoute.itemsget(req, res);
            itemMock.verify();
            done();
        });
    });
});

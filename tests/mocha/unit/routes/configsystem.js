const configsystemModel = require("../../../../models/openhabconfig");
const userModel = require("../../../../models/user");
const openhabModel = require("../../../../models/openhab");
const configsystemRoute = require("../../../../routes/configsystem");
const sinon = require("sinon");
const mockReq = require ('sinon-express-mock').mockReq;
const mockRes = require ('sinon-express-mock').mockRes;
require('sinon-mongoose');
const chai = require('chai');


describe('Unit test Event routes', function () {

    describe('Get Config', function () {

        var ohStub = new openhabModel({
            account: 'account', uuid: 'uuid',
            secret: 'secret'
        });
        var ohConfigStub = new configsystemModel({
            type: 'type', name: 'name',
            openhab: ohStub
        });

        var userMock;
        var openhabMock;
        var configsystemModelMock;

        beforeEach(function () {
            openhabMock = sinon.mock(openhabModel)
                .expects('findOne')
                .yields(null, ohStub);
            configsystemModelMock = sinon.mock(configsystemModel);
            configsystemModelMock
                .expects('findOne')
                .yields(null, ohConfigStub);
            userMock = sinon.mock(userModel);
            userMock.openhab = openhabMock;
        });

        afterEach(function () {
            configsystemModelMock.restore();
            openhabMock.restore();
            userMock.restore();
        });


        it('expect correct page with config', function () {
            var res = mockRes();
            var body = {};
            body.user = userMock;
            body.params = {'pid' : '123'};
            var req = mockReq(body);
            configsystemRoute.get(req, res);
            configsystemModelMock.verify();
        });
    });
});


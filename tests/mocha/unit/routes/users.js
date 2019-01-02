const userModel = require("../../../../models/user");
const userAccountModel = require("../../../../models/useraccount");
const openhabModel = require("../../../../models/openhab");
const usersRoute = require("../../../../routes/users");
const sinon = require("sinon");
require('sinon-mongoose');
const chai = require('chai');
const mockReq = require ('sinon-express-mock').mockReq;
const mockRes = require ('sinon-express-mock').mockRes;


describe('Unit test Users routes', function () {
    describe('Get Staff', function () {
        var userMock;
        var openhabMock;

        beforeEach(function () {
            userMock = sinon.mock(userModel);
            openhabMock = sinon.mock(openhabModel);
        });

        afterEach(function () {
            openhabMock.restore();
            userMock.restore();

        });


        it('expect correct page with users', function (done) {
            var res = mockRes();
            var body = {};
            body.user = {};
            body.user.account = sinon.mock(userAccountModel);
            var req = mockReq(body);
            var userMockFindExpectation = userMock
                .expects('find')
                .yields(null, [new userModel({login: "login", password: 'other_password'})]);
            usersRoute.usersget(req, res);
            userMockFindExpectation.verify();
            done();
        });

        it('expect correct users add get', function (done) {
            var res = mockRes();
            var body = {};
            body.user = {};
            body.user.account = sinon.mock(userAccountModel);
            var req = mockReq(body);
            var userMockFindExpectation = userMock
                .expects('find')
                .yields(null, [new userModel({login: "login", password: 'other_password'})]);
            usersRoute.usersaddget(req, res);
            userMockFindExpectation.verify();
            done();
        });
    });
});


const user = require("../../../../models/user");
const userAccount = require("../../../../models/useraccount");
const openHab = require("../../../../models/openhab");
const account = require("../../../../models/useraccount");
const sinon = require("sinon");
require('sinon-mongoose');
const chai = require('chai');


describe('Unit test for User methods', function () {

    var userMock;
    var userAccountMock;
    var openHabMock;

    beforeEach(function () {
        userMock = sinon.mock(user);
        userAccountMock = sinon.mock(userAccount);
        openHabMock = sinon.mock(openHab);
    });

    afterEach(function () {
        openHabMock.restore();
        userMock.restore();
        userAccountMock.restore();
    });

    describe('Register user to account', function () {
        it('Registration to account without database', function (done) {
            var login = 'login';
            var password = 'password';
            var role = 'role';
            var account = sinon.mock(account);
            user.registerToAccount(login, password, role, account, function (error) {
                chai.expect(error).not.to.be.null;
                userMock.verify();
                done();
            });
        });
    });

    describe('Auth user', function () {
        it('Correct auth', function (done) {
            var login = 'login';
            var password = 'password';
            userMock
                .expects('findOne')
                .chain('exec')
                .yields(null, new user({login: login, password: password}));
            user.authenticate(login, password, function (error) {
                chai.expect(error).to.be.null;
                userMock.verify();
                done();
            });
        });
        it('Auth for inactive user', function (done) {
            var login = 'login';
            var password = 'password';
            userMock
                .expects('findOne')
                .chain('exec')
                .yields(null, new user({login: login, password: password, active: false}));
            user.authenticate(login, password, function (error, login, message) {
                chai.expect(error).to.be.null;
                chai.expect(message.message).to.equal('User is not active');
                userMock.verify();
                done();
            });
        });
        it('Auth with inccorect password', function (done) {
            var login = 'login';
            var password = 'password';
            userMock
                .expects('findOne')
                .chain('exec')
                .yields(null, new user({login: login, password: 'other_password'}));
            user.authenticate(login, password, function (error, login, message) {
                chai.expect(error).to.be.null;
                chai.expect(message.message).to.equal('Unknown user or incorrect password');
                userMock.verify();
                done();
            });
        });
    })
});

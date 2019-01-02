const user = require("../../../models/user");
const account = require("../../../models/useraccount");
const userRoute = require("../../../routes/user");
const sinon = require("sinon");
const sinonMongoose = require('sinon-mongoose');
const chai = require('chai');
var mongoose = require('mongoose');


describe('Unit test user static methods', function () {
    describe('Create users', function () {
        it('expect error when register user without database', function (done) {
            var userMock = sinon.mock(user);
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
});

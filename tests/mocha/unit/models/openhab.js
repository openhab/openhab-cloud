const openhab = require("../../../../models/openhab");
const sinon = require("sinon");
const sinonMongoose = require('sinon-mongoose');
const chai = require('chai');



describe('Unit test for openhab methods', function () {

    var openHabMock;

    beforeEach(function () {
        openHabMock = sinon.mock(openhab);
        openHabMock.expects('findOne')
            .chain('exec')
            .yields(null, ohStub);
    });

    afterEach(function () {
        openHabMock.restore();
    });

    // describe('Register openhab', function () {
    //     it('Correct registration', function (done) {
    //         openhab.authenticate('uuid', 'secret', function (error) {
    //             openHabMock.verify();
    //             done();
    //         });
    //     })})
});

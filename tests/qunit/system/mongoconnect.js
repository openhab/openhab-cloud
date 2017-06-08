var system = require('../../../system'),
    globalExampleConfig = {
        system: {
            host: 'localhost',
            port: '1000',
            protocol: 'http'
        },
        mongodb: {
            user: 'test',
            password: 'test',
            hosts: 'localhost:1234',
            db: 'test'
        }
    },
    MongoConnect = require('../../../system/mongoconnect');

QUnit.module('MongoConnect');

QUnit.test('Own callback is run', function (assert) {
    assert.expect(1);
    system.setConfiguration(globalExampleConfig);

    var done = assert.async(),
        mongoConnect = new MongoConnect(system),
        mongoose = require('mongoose');

    // mock the connect method, we actually do not want to test this
    mongoose.connect = function (uri, callback) {
        callback('Connection failed');
    };

    mongoConnect.connect(mongoose, function (error) {
        // checks, if there IS an error
        assert.ok(error);
        done();
    });
});
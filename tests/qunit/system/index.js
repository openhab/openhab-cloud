var system = require('../../../system'),
    globalExampleConfig = {
        system: {
            host: 'localhost',
            port: '1000',
            protocol: 'http'
        }
    };

QUnit.module("System");

QUnit.test('Requiring twice returns same object', function (assert) {
    var requireSecond = require('../../../system');

    requireSecond.setConfiguration({ test: 'test' });

    assert.equal(system, requireSecond);
});

QUnit.test('Using baseurl results in correct host, port and protocol', function (assert) {
    var exampleConfig = {
        system: {
            baseurl: 'https://localhost:3000/'
        }
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getHost(), 'localhost');
    assert.equal(system.getPort(), '3000');
    assert.equal(system.getProtocol(), 'https');
});

QUnit.test('Using baseurl without protocol works correctly', function (assert) {
    var exampleConfig = {
        system: {
            baseurl: 'example.com:3000'
        }
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getHost(), 'example.com');
    assert.equal(system.getPort(), '3000');
    assert.equal(system.getProtocol(), 'http');
});

QUnit.test('#getHost()', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getHost(), 'localhost');
});

QUnit.test('#getPort', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getPort(), '1000');
});

QUnit.test('#getProtocol', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getProtocol(), 'http');
});

QUnit.test('#getBaseUrl', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getBaseURL(), 'http://localhost:1000');
});
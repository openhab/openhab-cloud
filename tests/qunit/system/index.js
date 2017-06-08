var system = require('../../../system'),
    globalExampleConfig = {
        system: {
            host: 'localhost',
            port: '1000',
            protocol: 'http'
        }
    };

QUnit.module('System');

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

QUnit.test('Using gcm.jid works for sender ID', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.gcm = {
        'jid': '123456@gcm.googleapis.com',
        'password': '1234'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.isGcmConfigured(), true);
    assert.equal(system.getGcmSenderId(), '123456');
    assert.equal(system.getGcmJid(), '123456@gcm.googleapis.com');
});

QUnit.test('Using gcm.senderId works', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.gcm = {
        'senderId': '123456',
        'password': '1234'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.isGcmConfigured(), true);
    assert.equal(system.getGcmSenderId(), '123456');
    assert.equal(system.getGcmJid(), '123456@gcm.googleapis.com');
});

QUnit.test('#isGcmConfigured', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.isGcmConfigured(), false);
});

QUnit.test('#getGcmJid, #getGcmSenderId, #getGcmPassword', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.gcm = {
        'senderId': '123456',
        'password': '1234'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getGcmSenderId(), '123456');
    assert.equal(system.getGcmJid(), '123456@gcm.googleapis.com');
    assert.equal(system.getGcmPassword(), '1234');
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

QUnit.test('#isUserRegistrationEnabled default=true', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.isUserRegistrationEnabled(), true);
});

QUnit.test('#isUserRegistrationEnabled false', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.registration_enabled = false;
    system.setConfiguration(exampleConfig);

    assert.equal(system.isUserRegistrationEnabled(), false);
});

QUnit.test('#isUserRegistrationEnabled true', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.registration_enabled = true;
    system.setConfiguration(exampleConfig);

    assert.equal(system.isUserRegistrationEnabled(), true);
});

QUnit.test('#hasLegalTerms & #hasLegalPolicy default', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.hasLegalTerms(), false);
    assert.equal(system.hasLegalPolicy(), false);
});

QUnit.test('#hasLegalTerms true', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.legal = {
        terms: 'http://example.com'
    };
    system.setConfiguration(exampleConfig);

    assert.equal(system.hasLegalTerms(), true);
});

QUnit.test('#hasLegalTerms false', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.legal = {};
    system.setConfiguration(exampleConfig);

    assert.equal(system.hasLegalTerms(), false);
});

QUnit.test('#hasLegalPolicy true', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.legal = {
        policy: 'http://example.com'
    };
    system.setConfiguration(exampleConfig);

    assert.equal(system.hasLegalPolicy(), true);
});

QUnit.test('#hasLegalPolicy false', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.legal = {};
    system.setConfiguration(exampleConfig);

    assert.equal(system.hasLegalPolicy(), false);
});

QUnit.test('#isIFTTTEnabled true', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.ifttt = true;
    system.setConfiguration(exampleConfig);

    assert.equal(system.isIFTTTEnabled(), true);
});

QUnit.test('#isIFTTTEnabled default', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.isIFTTTEnabled(), false);
});

QUnit.test('#getAppleLink without configuration', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getAppleLink(), 'https://itunes.apple.com/app/id492054521');
});

QUnit.test('#getAndroidLink without configuration', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.getAndroidLink(), 'https://play.google.com/store/apps/details?id=org.openhab.habdroid');
});

QUnit.test('#getAppleLink with configuration', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.apps = {
        appleId: '123456'
    };
    system.setConfiguration(exampleConfig);

    assert.equal(system.getAppleLink(), 'https://itunes.apple.com/app/id123456');
});

QUnit.test('#getAndroidLink with configuration', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.apps = {
        playStoreId: 'org.example'
    };
    system.setConfiguration(exampleConfig);

    assert.equal(system.getAndroidLink(), 'https://play.google.com/store/apps/details?id=org.example');
});

QUnit.test('#getDbUser without set', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.throws(
        function () { system.getDbUser(); },
        Error,
        'If db use ris not set, an error is thrown.'
    );
});

QUnit.test('#getDbUser', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        user: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getDbUser(), 'abc');
});

QUnit.test('#getDbPass without set', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.throws(
        function () { system.getDbPass(); },
        Error,
        'If db use ris not set, an error is thrown.'
    );
});

QUnit.test('#getDbPass', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        password: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getDbPass(), 'abc');
});

QUnit.test('#hasDbCredentials without set', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.equal(system.hasDbCredentials(), false);
});

QUnit.test('#hasDbCredentials with pass only', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        password: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.hasDbCredentials(), false);
});

QUnit.test('#hasDbCredentials with user only', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        user: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.hasDbCredentials(), false);
});

QUnit.test('#hasDbCredentials with userand pass', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        user: 'abc',
        password: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.hasDbCredentials(), true);
});

QUnit.test('#getDbName without set', function (assert) {
    system.setConfiguration(globalExampleConfig);

    assert.throws(
        function () { system.getDbName(); },
        Error,
        'If db use ris not set, an error is thrown.'
    );
});

QUnit.test('#getDbName', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        db: 'abc'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getDbName(), 'abc');
});

QUnit.test('#getDbHosts single host', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        hosts: 'localhost:1234'
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getDbHostsString(), 'localhost:1234');
});

QUnit.test('#getDbHosts multiple host', function (assert) {
    var exampleConfig = Object.assign({}, globalExampleConfig);
    exampleConfig.mongodb = {
        hosts: [
            'localhost:1234',
            'localhost2:1234',
            'localhost3:1234'
        ]
    };

    system.setConfiguration(exampleConfig);

    assert.equal(system.getDbHostsString(), 'localhost:1234,localhost2:1234,localhost3:1234');
});
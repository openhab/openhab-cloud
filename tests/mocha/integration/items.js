var should = require('should');
var supertest = require('supertest');
var session = require('supertest-session');
var lib = require('../../lib');
//variable to connect without session
var ohCloud = supertest.agent('http://localhost:3000');
var testSession;
describe('Items ', function () {
    before(function (done) {
        testSession = session('http://localhost:3000');
        testSession
            .get('/login')
            .set('Cookie', [])
            .end(function (err, res) {
                testSession.post('/login')
                    .send({
                        _csrf: lib.extractCsrfToken(res),
                        username: 'test@test.com',
                        password: '1234ASD'
                    })
                    .end(function (err) {
                        testSession
                            .get('/setTimezone?tz=America/New_York')
                            .end(
                                function (err) {
                                    if (err) return done(err);
                                    return done();
                                });
                    });

            });
    });
    it('Open Items page with correct credentials', function (done) {
        testSession.get('/items')
            .expect(200)
            .end(function (err, res) {
                var containedItem = res.text.indexOf('<h1 class="span8">Items</h1>');
                res.text.should.containedItem;
                done(err);
            });
    });

    it('Redirect to login page if not loggined', function (done) {
        ohCloud.get('/items')
            .expect(302)
            .expect('Location', '/login')
            .end(function (err, res) {
                done(err);
            });
    });
});
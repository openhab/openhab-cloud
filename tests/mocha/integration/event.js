var session = require('supertest-session');
var supertest = require('supertest');
var should = require('should');
var lib = require('../../lib');
//variable to connect without session
var ohCloud = supertest.agent('http://localhost:3000');
var testSession;
describe('Events', function () {

    before(function (done) {
        testSession = session('http://localhost:3000');
        testSession
            .get('/login')
            .set('Cookie', [])
            .end(function (err, res) {
                testSession.post('/login')
                    .send({
                        _csrf: lib.extractCsrfToken(res),
                        username: 'mordarulit@mail.ru',
                        password: 'rewas123'
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
    it('Open events page with correct credentials', function (done) {
        testSession.get('/events')
            .expect(200)
            .end(function (err, res) {
                var containedItem = res.text.indexOf('<h1 class="span8">Events</h1>') > -1;
                res.text.should.containedItem;
                done(err);
            });
    });

    it('Redirect to login page if not loggined', function (done) {
        ohCloud.get('/devices')
            .expect(302)
            .expect('Location', '/login')
            .end(function (err, res) {
                done(err);
            });
    });

});
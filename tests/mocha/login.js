var supertest = require('supertest');
var should = require('should');
var lib = require('../lib');
var user = require('../../models/user');

var ohCloud = supertest.agent('http://localhost:3000');

describe('Test login', function() {
    before('create necessary user', function (done) {
        user.register('test', '123', done);
    });

    it('redirect to login for false credentials', function(done) {
        ohCloud
            .get('/login')
            .expect(200)
            .set('cookie', [])
            .end(function(err, res) {
                ohCloud
                    .post('/login')
                    .set('cookie', res.headers['set-cookie'])
                    .send({
                        _csrf: lib.extractCsrfToken(res),
                        username: 'test',
                        password: 'test_false'
                    })
                    .expect(302)
                    .expect('Location', '/login')
                    .end(function(err) {
                        done(err);
                    });
            });
    });

    it('redirects to home for correct credentials', function(done) {
        ohCloud
            .get('/login')
            .expect(200)
            .set('cookie', [])
            .end(function(err, res) {
                ohCloud
                    .post('/login')
                    .set('cookie', res.headers['set-cookie'])
                    .send({
                        _csrf: lib.extractCsrfToken(res),
                        username: 'test',
                        password: '123'
                    })
                    .expect(302)
                    .expect('Location', '/')
                    .end(function(err) {
                        done(err);
                    });
            });
    })
});
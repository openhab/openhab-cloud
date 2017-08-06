var supertest = require('supertest');
var should = require('should');
var lib = require('../lib');
var user = require('../../models/user');

var ohCloud = supertest.agent('http://localhost:3000');

describe('Test login', function(){
    it('redirect to login for false credentials', function(done) {
        ohCloud
            .get('/login')
            .expect(200)
            .end(function(err, res) {
                ohCloud
                    .post('/login')
                    .set('cookie', res.headers['set-cookie'])
                    .field('_csrf', lib.extractCsrfToken(res))
                    .field('username', 'test')
                    .field('password', 'test_false')
                    .expect(302)
                    .expect('Location', '/login')
                    .end(function(err) {
                        done(err);
                    });
            });
    });

    it('redirects to home for correct credentials', function(done) {
        before(function () {
            user.register("test", "123");
        });

        ohCloud
            .get('/login')
            .expect(200)
            .end(function(err, res) {
                ohCloud
                    .post('/login')
                    .set('cookie', res.headers['set-cookie'])
                    .field('_csrf', lib.extractCsrfToken(res))
                    .field('username', 'test')
                    .field('password', '123')
                    .expect(302)
                    .expect('Location', '/')
                    .end(function(err) {
                        done(err);
                    });
            });
    })
});
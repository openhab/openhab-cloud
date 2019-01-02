var supertest = require('supertest');
var should = require('should');
var lib = require('../../lib');
require('mocha');
var session = require('supertest-session');
var ohCloud = supertest.agent('http://localhost:3000');
//variable for save session
var testSession = session('http://localhost:3000');


describe('Registration, authorization and account management', function () {
    describe('Registration', function () {
        it('Register new account with short password', function (done) {
            testSession
                .get('/login')
                .expect(200)
                .set('Cookie', [])
                .end(function (err, res) {
                    testSession
                        .post('/register')
                        .set('Cookie', [])
                        .send({
                            _csrf: lib.extractCsrfToken(res),
                            username: 'test@test.org',
                            openhabuuid: '123',
                            openhabsecret: '123',
                            password: '123'
                        })
                        .expect(200)
                        .end(function (err, res) {
                            var containedItem = (res.text.indexOf('Your password must be at least 4 characters long') > -1);
                            res.text.should.containedItem;
                            done(err);
                        });
                });
        });

        it('Register new account with incorrect email', function (done) {
            testSession
                .get('/login')
                .expect(200)
                .set('Cookie', [])
                .end(function (err, res) {
                    testSession
                        .post('/register')
                        .set('Cookie', [])
                        .send({
                            _csrf: lib.extractCsrfToken(res),
                            username: 'test@test',
                            openhabuuid: '123',
                            openhabsecret: '123',
                            password: '1234'
                        })
                        .expect(200)
                        .end(function (err, res) {
                            var containedItem = (res.text.indexOf('Username is not an email address') > -1);
                            res.text.should.containedItem;
                            done(err);
                        });
                });
        });

        it('Register new account with correct data', function (done) {
            testSession
                .get('/login')
                .expect(200)
                .set('Cookie', [])
                .end(function (err, res) {
                    testSession
                        .post('/register')
                        .set('Cookie', [])
                        .send({
                            _csrf: lib.extractCsrfToken(res),
                            username: 'test@test.com',
                            openhabuuid: '11114',
                            openhabsecret: '122222',
                            password: '1234ASD'
                        })
                        .expect(302)
                        .expect('Location', '/')
                        .end(function (err, res) {
                            done(err);
                        });
                });
        });

    });
    describe('Authorization', function () {
        it('Redirect to login for false credentials', function (done) {
            testSession
                .get('/login')
                .expect(200)
                .set('Cookie', [])
                .end(function (err, res) {
                    testSession
                        .post('/login')
                        .set('Cookie', [])
                        .send({
                            _csrf: lib.extractCsrfToken(res),
                            username: 'test',
                            password: 'test_false'
                        })
                        .expect(302)
                        .expect('Location', '/login')
                        .end(function (err) {
                            done(err);
                        });
                });
        });

        it('Return Unauthorized if OH not connected', function (done) {
            ohCloud
                .get('/rest')
                .expect(401)
                .end(function (err, res) {
                    done(err);
                });
        });

        it('Redirects to home for correct credentials', function (done) {
            testSession
                .get('/login')
                .expect(200)
                .set('Cookie', [])
                .end(function (err, res) {
                    testSession
                        .post('/login')
                        .set('Cookie', [])
                        .send({
                            _csrf: lib.extractCsrfToken(res),
                            username: 'test@test.com',
                            password: '1234ASD'
                        })
                        .expect(302)
                        .expect('Location', '/')
                        .end(function (err) {
                            done(err);
                        });
                });
        });
    });
});
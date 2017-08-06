var supertest = require('supertest');
var should = require('should');

var ohCloud = supertest.agent('http://localhost:3000');

describe('Test main page of openHAB-cloud', function(){
    it('should return home page', function(done) {
        ohCloud
            .get('/')
            .expect('Content-type', /html/)
            .set('Cookie', [])
            .expect(200)
            .end(function(err) {
                done(err);
            });
    });

    it('should contain a login section', function(done) {
        ohCloud
            .get('/')
            .set('Cookie', [])
            .expect(200)
            .end(function(err, res) {
                res.text.should.match(/action="\/login"/);
                done(err)
            })
    });
});
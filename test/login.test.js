const request = require('supertest')
const faker = require('@faker-js/faker').faker

require('should')

// TODO: This connection boilerplate doesn't really belong here.
// This db require must come before any other project module requires to
// prevent corrupting the actual database.
const db = require('../lib/db')({
    connection: ':memory:',
    pool: {
        min: 1,
        max: 1,
        disposeTimeout: 360000 * 1000,
        idleTimeoutMillis: 360000 * 1000
    }
})
const testDb = require('./lib/db')

after(() => {
    db.knex.destroy((err) => {
        console.log(err)
    })
})

describe('login', function () {
    const tableName = null

    let testData = null

    beforeEach(function (done) {
        const Artist = db.model('artist')

        testDb.buildSchema()
            .then(() => {
                return testDb.tableDefs.loadModels()
            })
            .then(() => {
                return testDb.getTestData(tableName)
            })
            .then(td => {
                testData = td
                done();
            })
            .catch((err) => {
                done(err)
            })
    })

    describe('logging in', function() {
        it('succeeds', function(done) {
            testData.request
                .post('/login')
                .send({username: testData.jwtUser.name, password: testData.jwtUser.password})
                .set('Accept', 'application/json')
                .expect(200)
                .expect('Content-Type', /application\/text/)
                .end(function(err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal(testData.jwtToken);
                    done();
                })
        })

        it('fails on bad password', function(done) {
            testData.request
                .post('/login')
                .send({ username: testData.jwtUser.name, password: testData.jwtUser.password + 'yzyyz' })
                .set('Accept', 'application/json')
                .expect(401)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal('Username or password not recognized');
                    done();
                })
        })

        it('fails on bad username', function (done) {
            testData.request
                .post('/login')
                .send({ username: testData.newName, password: testData.jwtUser.password })
                .set('Accept', 'application/json')
                .expect(401)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal('Username or password not recognized');
                    done();
                })
        })
    })

    describe('checking login', function () {
        it('should succeed', function(done) {
            testData.request
                .get(`/login`)
                .set('Accept', 'application/json')
                .set('Authorization', testData.authorizationHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err
                    res.body.should.deepEqual({loggedIn: true})
                    done();
                })
        })

        it('should fail without header', function(done) {
            testData.request
                .get(`/login`)
                .set('Accept', 'application/json')
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err
                    res.body.should.deepEqual({loggedIn: false})
                    done();
                })
        })

        it('should fail with bad header', function(done) {
            const badHeader = testData.authorizationHeader.replace(/.$/, 'xx');

            testData.request
                .get(`/login`)
                .set('Accept', 'application/json')
                .set('Authorization', badHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err
                    res.body.should.deepEqual({ loggedIn: false })
                    done();
                })
        })

        it('should fail for missing session',  function(done) {
            const badSessionToken = db.model('session').generateToken() + 'YXZZY';
            const [ ,badHeader] = testDb.makeJWT({
                sub: badSessionToken,
                user: {
                }
            });

            testData.request
                .get(`/login`)
                .set('Accept', 'application/json')
                .set('Authorization', badHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err
                    res.body.should.deepEqual({ loggedIn: false })
                    done();
                })
        })
    });

    describe('logging out', function() {
        it('should logout', function(done) {
            testData.request
                .post(`/logout`)
                .send({})
                .set('Accept', 'application/json')
                .set('Authorization', testData.authorizationHeader)
                .expect(200)
                // .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err
                    res.body.should.deepEqual({})
                    res.text.should.equal('OK');

                    db.model('session').fetchByToken(testData.jwtSession.session_token)
                        .then(sessionModel => {
                            done(new Error('Session should not exist'));
                        })
                        .catch(err => {
                            done();
                        });
                })

        });
    });
})

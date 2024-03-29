const sinon = require('sinon');

require('should');

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
});
const testDb = require('./lib/db');
const authJWT = require('../passport/JWTStrategy');

after((done) => {
    db.knex.destroy((err) => {
        if (err) done(err);
        done();
    });
});

describe('login', function () {
    const tableName = null;

    let testData = null;

    beforeEach(function (done) {
        testDb.buildSchema()
            .then(() => {
                return testDb.tableDefs.loadModels();
            })
            .then(() => {
                return testDb.getTestData(tableName);
            })
            .then(td => {
                testData = td;
                return testDb.getTestModel('user');
            })
            .then(testUser => {
                testData.user = testUser;
                return db.model('session')
                    .count()
                    .where('user_id', '=', testData.user.id);
            })
            .then(sessionCount => {
                testData.sessionCount = sessionCount;
                done();
            })
            .catch((err) => {
                done(err);
            });
    });

    describe('logging in', function () {
        const sandbox = sinon.createSandbox();

        beforeEach(function () {
            sandbox.spy(authJWT, 'makeToken');
        });

        afterEach(function () {
            sandbox.restore();
        });

        it('succeeds', function (done) {
            testData.request
                .post('/login')
                .send({ username: testData.jwtUser.name, password: testData.jwtUser.password })
                .set('Accept', 'text/plain')
                .expect(200)
                .expect('Content-Type', /text\/plain/)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal(authJWT.makeToken.returnValues[0]);

                    db.model('session')
                        .count()
                        .where('user_id', '=', testData.user.id)
                        .then(sessionCount => {
                            sessionCount[0].rows.should.equal(testData.sessionCount[0].rows + 1);
                            done();
                        })
                        .catch(err => {
                            // Assertions are caught by the promise. Make sure they get handled.
                            done(err);
                        });
                });
        });

        it('fails on bad password', function (done) {
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
                });
        });

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
                });
        });
    });

    describe('checking login', function () {
        it('should succeed', function (done) {
            testData.request
                .get('/login')
                .set('Accept', 'application/json')
                .set('Authorization', testData.authorizationHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({ loggedIn: true, token: testData.jwtToken });
                    done();
                });
        });

        it('should fail without header', function (done) {
            testData.request
                .get('/login')
                .set('Accept', 'application/json')
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({ loggedIn: false, message: 'No Authorization Found' });
                    done();
                });
        });

        it('should fail with bad header', function (done) {
            const badHeader = testData.authorizationHeader.replace(/.$/, 'xx');

            testData.request
                .get('/login')
                .set('Accept', 'application/json')
                .set('Authorization', badHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({ loggedIn: false, message: 'JsonWebTokenError: invalid signature' });
                    done();
                });
        });

        it('should fail for missing session', function (done) {
            const badSessionToken = db.model('session').generateToken() + 'YXZZY';
            const [, badHeader] = testDb.makeJWT({
                sub: badSessionToken,
                user: {
                }
            });

            testData.request
                .get('/login')
                .set('Accept', 'application/json')
                .set('Authorization', badHeader)
                .expect(200)
                .expect('Content-Type', /json/)
                .end(function (err, res) {
                    if (err) throw err;
                    console.log(res.body);
                    res.body.should.deepEqual({ loggedIn: false, message: 'Session not found' });
                    done();
                });
        });

        // ExpressJS does not get along with Sinon fake timer.  If you enable fake timer,
        // the request never completes.  I tried to work around this by doing the tick
        // before the request, but that causes the test to fail because the token never
        // appears to expire.
        //
        // On some level, maybe it doesn't matter.  The utility function this relies on
        // is tested pretty well.
        //
        //
        // it('should fail on expired session', function (done) {
        //     const clock = sinon.useFakeTimers()

        //     const expireTime = testData.user.session_expires * 60 * 1000 + 1000
        //     clock.tick(expireTime)
        //     clock.tick(1000)

        //     testData.request
        //         .get('/login')
        //         .set('Accept', 'application/json')
        //         .set('Authorization', testData.authorizationHeader)
        //         .expect(200)
        //         .expect('Content-Type', /json/)
        //         .end(function (err, res) {
        //             if (err) throw err
        //             res.body.should.deepEqual({ loggedIn: false, message: 'Session expired' })
        //             done()
        //             clock.restore();
        //         })
        // })
    });

    describe('refresh token', function () {
        const sandbox = sinon.createSandbox();

        beforeEach(function () {
            sandbox.spy(authJWT, 'makeToken');
        });

        afterEach(function () {
            sandbox.restore();
        });

        it('should get a new token', function (done) {
            testData.request
                .put('/login')
                .set('Accept', 'text/plain')
                .set('Authorization', testData.authorizationHeader)
                .expect(200)
                .expect('Content-Type', /text\/plain/)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal(authJWT.makeToken.returnValues[0]);
                    done();
                });
        });
    });

    describe('logging out', function () {
        it('should logout', function (done) {
            testData.request
                .post('/logout')
                .send({})
                .set('Accept', 'application/json')
                .set('Authorization', testData.authorizationHeader)
                .expect(200)
                .end(function (err, res) {
                    if (err) throw err;
                    res.body.should.deepEqual({});
                    res.text.should.equal('OK');

                    db.model('session').fetchByToken(testData.jwtSession.session_token)
                        .then(sessionModel => {
                            if (sessionModel) {
                                done(new Error('Session should not exist'));
                            } else {
                                done();
                            }
                        })
                        .catch(() => {
                            done();
                        });
                });
        });
    });
});

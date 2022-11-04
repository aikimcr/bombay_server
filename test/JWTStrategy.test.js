const should = require('should')
const sinon = require('sinon')

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

const jwt = require('jsonwebtoken')

const authJWT = require('../passport/JWTStrategy')

after(() => {
    db.knex.destroy((err) => {
        console.log(err)
    })
})

describe('JWT Strategy', function () {
    let testData = null

    beforeEach(function (done) {
        testDb.buildSchema()
            .then(() => {
                return testDb.tableDefs.loadModels()
            })
            .then(() => {
                return testDb.getTestData()
            })
            .then((td) => {
                testData = td
                return testDb.getTestModel('user')
            })
            .then(testUser => {
                testData.user = testUser
                done()
            })
            .catch((err) => {
                done(err)
            })
    })

    describe('verifySession', function () {
        it('should verify the session', async function () {
            const token = jwt.sign(testData.jwtPayload, testData.app.get('jwt_secret'))
            const decoded = jwt.decode(token)
            const [err, user] = await authJWT.verifySession(decoded)
            should(err).be.exactly(null)
            user.should.deepEqual(testData.jwtPayload.user)
        })

        it('should fail on mismatched user id', async function () {
            const badId = testData.jwtPayload.user.id + 10
            const badUser = { ...testData.jwtPayload.user, id: badId }
            const token = jwt.sign({ ...testData.jwtPayload, user: badUser }, testData.app.get('jwt_secret'))
            const decoded = jwt.decode(token)
            const [err, user] = await authJWT.verifySession(decoded)
            err.should.match(/Session and User mismatch/)
            user.should.be.false()
        })

        it('should fail on no session', async function () {
            const token = jwt.sign({ ...testData.jwtPayload, sub: 'xyzzy not here' }, testData.app.get('jwt_secret'))
            const decoded = jwt.decode(token)
            const [err, user] = await authJWT.verifySession(decoded)
            err.should.match(/Session not found/)
            user.should.be.false()
        })

        it('should fail on expired session', async function () {
            const clock = sinon.useFakeTimers();
            const token = jwt.sign(testData.jwtPayload, testData.app.get('jwt_secret'))
            const decoded = jwt.decode(token)

            // Convert number of minutes from user to milliseconds
            const expireTime = testData.user.session_expires * 60 * 1000

            let [err, user] = await authJWT.verifySession(decoded)
            should(err).be.exactly(null)
            user.should.deepEqual(testData.jwtPayload.user)

            clock.tick(expireTime / 2);
            [err, user] = await authJWT.verifySession(decoded)
            should(err).be.exactly(null)
            user.should.deepEqual(testData.jwtPayload.user)

            clock.tick(expireTime / 2)
            clock.tick(1000); // Fudge it past the threshold
            [err, user] = await authJWT.verifySession(decoded)
            err.should.match(/Session expired/)
            user.should.be.false()

            clock.restore();
        })
    })

    describe('isLoggedIn', function () {
        let clock;
        const sandbox = sinon.createSandbox()

        beforeEach(function () {
            clock = sinon.useFakeTimers();
            sandbox.spy(authJWT, 'makeToken')

            // Need to add a few things to the request because we're not going through a route.
            testData.request.app = testData.app
            testData.request.header = (headerName) => {
                return testData.request._headers[headerName]
            }
            testData.request._headers = {}
        });

        afterEach(function () {
            clock.restore();
            sandbox.restore();
        });

        it('should return true', async function () {
            testData.request._headers.Authorization = testData.authorizationHeader
            const [status, newToken] = await authJWT.isLoggedIn(testData.request)
            status.should.be.true();
            newToken.should.equal(testData.jwtToken);
        });

        it('should fail on mismatched user id', async function () {
            const badId = testData.jwtPayload.user.id + 10
            const badUser = { ...testData.jwtPayload.user, id: badId }
            const token = jwt.sign({ ...testData.jwtPayload, user: badUser }, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`
            const [status, error] = await authJWT.isLoggedIn(testData.request)
            status.should.be.false()
            error.should.match(/Session and User mismatch/)
        })

        it('should fail on no session', async function () {
            const token = jwt.sign({ ...testData.jwtPayload, sub: 'xyzzy not here' }, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`
            const [status, error] = await authJWT.isLoggedIn(testData.request)
            status.should.be.false()
            error.should.match(/Session not found/)
        })

        it('should fail on no token', async function () {
            const [status, error] = await authJWT.isLoggedIn(testData.request)
            status.should.be.false()
            error.should.match(/No Authorization Found/)
        })

        it('should fail on expired session', async function () {
            const token = jwt.sign(testData.jwtPayload, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`

            // Convert number of minutes from user to milliseconds
            const expireTime = testData.user.session_expires * 60 * 1000

            let [status, errorOrToken] = await authJWT.isLoggedIn(testData.request)
            status.should.be.true();
            errorOrToken.should.equal(token);
            testData.request._headers.Authorization = `Bearer ${errorOrToken}`

            clock.tick(expireTime / 2);
            [status, errorOrToken] = await authJWT.isLoggedIn(testData.request)
            status.should.be.true();
            errorOrToken.should.equal(token);
            testData.request._headers.Authorization = `Bearer ${errorOrToken}`

            // The iat is updated along with the token, so use the full expire time.
            // NOTE: This is *different* verifySession
            clock.tick(expireTime)
            clock.tick(1000); // Fudge it past the threshold
            [status, errorOrToken] = await authJWT.isLoggedIn(testData.request)
            status.should.be.false();
            errorOrToken.should.match(/Session expired/)
        })
    })

    describe('refreshToken', function () {
        let clock;
        const sandbox = sinon.createSandbox()

        beforeEach(function () {
            clock = sinon.useFakeTimers();
            sandbox.spy(authJWT, 'makeToken')

            // Need to add a few things to the request because we're not going through a route.
            testData.request.app = testData.app
            testData.request.header = (headerName) => {
                return testData.request._headers[headerName]
            }
            testData.request._headers = {}
        });

        afterEach(function () {
            clock.restore();
            sandbox.restore();
        });

        it('should return a new token', async function () {
            testData.request._headers.Authorization = testData.authorizationHeader
            const [err, newToken] = await authJWT.refreshToken(testData.request)
            should(err).be.exactly(null)
            newToken.should.equal(authJWT.makeToken.returnValues[0]);
        });

        it('should fail on mismatched user id', async function () {
            const badId = testData.jwtPayload.user.id + 10
            const badUser = { ...testData.jwtPayload.user, id: badId }
            const token = jwt.sign({ ...testData.jwtPayload, user: badUser }, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`
            const [err, newToken] = await authJWT.refreshToken(testData.request)
            err.should.match(/Session and User mismatch/)
            newToken.should.be.false()
        })

        it('should fail on no session', async function () {
            const token = jwt.sign({ ...testData.jwtPayload, sub: 'xyzzy not here' }, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`
            const [err, newToken] = await authJWT.refreshToken(testData.request)
            err.should.match(/Session not found/)
            newToken.should.be.false()
        })

        it('should fail on no token', async function () {
            const [err, newToken] = await authJWT.refreshToken(testData.request)
            err.should.match(/No Authorization Found/)
            newToken.should.be.false()
        })

        it('should fail on expired session', async function () {
            const token = jwt.sign(testData.jwtPayload, testData.app.get('jwt_secret'))
            testData.request._headers.Authorization = `Bearer ${token}`

            // Convert number of minutes from user to milliseconds
            const expireTime = testData.user.session_expires * 60 * 1000

            let [err, newToken] = await authJWT.refreshToken(testData.request)
            should(err).be.exactly(null)
            newToken.should.equal(authJWT.makeToken.returnValues[0]);
            testData.request._headers.Authorization = `Bearer ${newToken}`

            clock.tick(expireTime / 2);
            [err, newToken] = await authJWT.refreshToken(testData.request)
            should(err).be.exactly(null)
            newToken.should.equal(authJWT.makeToken.returnValues[1]);
            testData.request._headers.Authorization = `Bearer ${newToken}`

            // The iat is updated along with the token, so use the full expire time.
            // NOTE: This is *different* verifySession
            clock.tick(expireTime)
            clock.tick(1000); // Fudge it past the threshold
            [err, newToken] = await authJWT.refreshToken(testData.request)
            err.should.match(/Session expired/)
            newToken.should.be.false()
        })
    })
})

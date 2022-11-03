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

let clock
beforeEach(function () {
  clock = sinon.useFakeTimers()
})

afterEach(function () {
  clock.restore()
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
    })
  })
})
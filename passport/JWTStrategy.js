const JWTStrategy = require('passport-jwt').Strategy
const ExtractJwt = require('passport-jwt').ExtractJwt

const createError = require('http-errors')

const db = require('../lib/db')()
const jwt = require('jsonwebtoken')

exports.verifySession = async function (jwtPayload) {
    debugger
    let userId
    let errorText
    let sessionModel

    try {
        sessionModel = await db.model('session').fetchByToken(jwtPayload.sub)
        userId = sessionModel.get('user_id')
    } catch (err) {
        // debugger;

        // // Debugging
        // const sessionCollection = await db.model('session').collection().fetch()
        //     .catch(err => { console.error(err) })

        // console.log(jwtPayload.sub, sessionCollection.models)
        // const matchingModel = sessionCollection.find(model => {
        //     return model.get('sessions_token') === jwtPayload.sub;
        // })
        // // Debugging

        // debugger;

        errorText = createError(401, 'Session not found')
    }

    if (errorText) return [errorText, false]

    if (userId !== jwtPayload.user.id) return [createError(401, 'Session and User mismatch'), false]

    try {
        const userModel = await db.model('user').fetchById(userId)

        const expireSeconds = userModel.get('session_expires') * 60
        const nowSeconds = parseInt(Date.now() / 1000) // convert from milliseconds

        if (nowSeconds - expireSeconds > jwtPayload.iat) {
            errorText = createError(401, 'Session expired')
        }
    } catch (err) {
        // This really should not even be possible.  But paranoia pays in code.
        errorText = createError(401, 'No such user')
    }

    if (errorText) return [errorText, false]

    return [null, jwtPayload.user, sessionModel]
}

exports.refreshToken = async function (req) {
    const token = exports.getToken(req)
    if (!token) return [false, 'No Authorization Found']

    let errorText
    let sessionModel
    let newPayload

    debugger
    try {
        const payload = jwt.verify(token, req.app.get('jwt_secret'));
        [errorText, user, sessionModel] = await exports.verifySession(payload)
        if (errorText) return [errorText, false]
        newPayload = { ...payload }
        delete newPayload.iat
    } catch (err) {
        errorText = createError(401, 'Invalid token')
        return [errorText, false]
    }

    debugger
    const newToken = db.model('session').generateToken()
    const sessionStart = new Date().toISOString()

    db.model('session')
        .save({
            session_token: newToken,
            session_start: sessionStart
        }, { patch: true })
        .catch(err => {
            errorText = createError(500, `Unable to update session ${err.message}`)
        })

    if (errorText) return [errorText, false]

    debugger
    newPayload.sub = newToken
    const jwtToken = exports.makeToken(req, newPayload)

    return [null, jwtToken]
}

exports.makeToken = function (req, payload) {
    return jwt.sign(payload, req.app.get('jwt_secret'))
}

exports.getToken = function (req) {
    const authHeader = req.header('Authorization')

    if (!authHeader) return null

    return authHeader.replace(/^Bearer\s+/, '')
}

exports.isLoggedIn = async function (req) {
    const token = exports.getToken(req)
    if (!token) return [false, 'No Authorization Found']

    try {
        const payload = jwt.verify(token, req.app.get('jwt_secret'));
        [err, result] = await exports.verifySession(payload)
        if (err) return [false, err]
        return [true, token]
    } catch (err) {
        return [false, err]
    }
}

// https://github.com/mikenicholson/passport-jwt
exports.getStrategy = function (secretOrKey) {
    return new JWTStrategy(
        { // options
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey
        },
        (jwtPayload, done) => { // verify
            exports.verifySession(jwtPayload)
                .then(([err, payload]) => {
                    done(err, payload)
                })
        }
    )
}

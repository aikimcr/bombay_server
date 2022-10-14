const JWTStrategy = require('passport-jwt').Strategy
const ExtractJwt = require('passport-jwt').ExtractJwt

const createError = require('http-errors')

const db = require('../lib/db')()
const jwt = require('jsonwebtoken')

exports.verifySession = async function (jwt_payload) {
    let user_id;
    let errorText;

    try {
        const sessionModel = await db.model('session').fetchByToken(jwt_payload.sub)
        user_id = sessionModel.get('user_id');
    } catch (err) {
        errorText = createError(401, 'Session not found');
    }

    if (errorText) return [errorText, false];

    if (user_id !== jwt_payload.user.id) return [createError(401, 'Session and User mismatch'), false];

    try {
        const userModel = await db.model('user').fetchById(user_id)
    } catch (err) {
        // This really should not even be possible.  But paranoia pays in code.
        errorText = createError(401, 'No such user');
    }

    if (errorText) return [errorText, false];

    return [null, jwt_payload.user];
}

exports.getToken = function(req) {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) return null
    
    return authHeader.replace(/^Bearer\s+/, '');
}

exports.isLoggedIn = async function (req) {
    token = exports.getToken(req)
    if (!token) return false

    try {
        const payload = jwt.verify(token, req.app.get('jwt_secret'));
        [err, result] = await exports.verifySession(payload)
        if (err) return false;
        return true
    } catch (err) {
        return false
    }
}

// https://github.com/mikenicholson/passport-jwt
exports.getStrategy = function (secretOrKey) {
    return new JWTStrategy(
        { // options
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey
        },
        (jwt_payload, done) => { // verify
            exports.verifySession(jwt_payload)
                .then(([err, payload]) => {
                    done(err, payload);
                });
        }
    )
}

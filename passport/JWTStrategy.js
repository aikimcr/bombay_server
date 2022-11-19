const JWTStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const createError = require('http-errors');

const db = require('../lib/db')();
const jwt = require('jsonwebtoken');

exports.verifySession = async function (jwtPayload) {
    let userId;
    let errorObject;
    let sessionModel;

    try {
        sessionModel = await db.model('session').fetchByToken(jwtPayload.sub);
        userId = sessionModel.user_id;
    } catch (err) {
        errorObject = createError(401, 'Session not found');
    }

    if (errorObject) return [errorObject, false];

    if (userId !== jwtPayload.user.id) return [createError(401, 'Session and User mismatch'), false];

    try {
        const userModel = await db.model('user').fetchById(userId);

        const expireSeconds = userModel.session_expires * 60;
        const nowSeconds = parseInt(Date.now() / 1000); // convert from milliseconds

        if (nowSeconds - expireSeconds > jwtPayload.iat) {
            errorObject = createError(401, 'Session expired');
        }
    } catch (err) {
        // This really should not even be possible.  But paranoia pays in code.
        errorObject = createError(401, 'No such user');
    }

    if (errorObject) return [errorObject, false];

    return [null, jwtPayload.user, sessionModel];
};

exports.refreshToken = async function (req) {
    const token = exports.getToken(req);
    if (!token) return [createError(401, 'No Authorization Found'), false];

    let sessionModel;
    let errorObject;
    let newPayload;

    try {
        const payload = jwt.verify(token, req.app.get('jwt_secret'));
        [errorObject, , sessionModel] = await exports.verifySession(payload);
        if (errorObject) return [errorObject, false];
        newPayload = { ...payload };
        delete newPayload.iat;
    } catch (err) {
        errorObject = createError(401, 'Invalid token');
        return [errorObject, false];
    }

    const newToken = db.model('session').generateToken();
    const sessionStart = new Date().toISOString();

    await db.model('session')
        .update({
            session_token: newToken,
            session_start: sessionStart
        }, { debug: false })
        .where('id', '=', sessionModel.id)
        .catch(err => {
            errorObject = createError(500, `Unable to update session ${err.message}`);
        });

    if (errorObject) return [errorObject, false];

    newPayload.sub = newToken;
    const jwtToken = exports.makeToken(req, newPayload);

    return [null, jwtToken];
};

exports.makeToken = function (req, payload) {
    return jwt.sign(payload, req.app.get('jwt_secret'));
};

exports.getToken = function (req) {
    const authHeader = req.header('Authorization');

    if (!authHeader) return null;

    return authHeader.replace(/^Bearer\s+/, '');
};

// This returns the logged in status first, error or token last.  This is
// different from other places.  The semantics of this one are different as well,
// but there needs to be some normalization here.
exports.isLoggedIn = async function (req) {
    const token = exports.getToken(req);
    if (!token) return [false, createError(401, 'No Authorization Found')];

    try {
        const payload = jwt.verify(token, req.app.get('jwt_secret'));
        const [errorObject] = await exports.verifySession(payload);
        if (errorObject) return [false, errorObject];
        return [true, token];
    } catch (err) {
        const message = err.name ? `${err.name}: ${err.message}` : err.message;
        return [false, createError(401, message)];
    }
};

exports.deleteStaleSessions = async function () {
    const expireTime = new Date();

    expireTime.setHours(expireTime.getHours() - 4);
    console.log(`Remove sessions started before ${expireTime.toLocaleString()}`);

    db.knex.del()
        .from('session')
        .whereIn('id', function () {
            this.select()
                .column('id')
                .from('session')
                .where('session_start', '<', expireTime.toISOString())
                .orderBy('session_start', 'asc')
                .limit(100); // Don't let the process get hung up if there are a lot of stale sessions
        })
        .debug(true)
        .then(result => {
            console.log('Session Cleanup Result', result);
        })
        .catch(err => {
            console.warn('Session Cleanup Error', err);
        });
};

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
                    done(err, payload);
                })
                .catch(err => {
                    done(err, false);
                });
        }
    );
};

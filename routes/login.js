const jwt = require('jsonwebtoken');
const passport = require('passport');

const createError = require('http-errors');

const db = require('../lib/db')();
const authJWT = require('../passport/JWTStrategy');

exports.checkLogin = async (req, res, next) => {
    const [isLoggedIn, errorOrToken] = await authJWT.isLoggedIn(req);
    const result = { loggedIn: isLoggedIn };

    if (isLoggedIn) {
        result.token = errorOrToken;
    } else {
        result.message = errorOrToken.message;
    }

    res.json(result);
};

exports.refreshToken = async (req, res, next) => {
    const [error, newToken] = await authJWT.refreshToken(req);

    if (error) return next(error);
    return res.json(newToken);
};

exports.doLogin = (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, payload, done) => {
        if (err) {
            return next(err);
        }

        if (!payload) {
            return next(createError(400, 'Unknown Authentication Error'));
        }

        req.login(payload, { session: false }, err => {
            if (err) return next(err);

            const token = authJWT.makeToken(req, payload);
            res.setHeader('Content-Type', 'application/text');
            return res.send(token);
        });
    })(req, res);
};

exports.doLogout = async (req, res, next) => {
    const [isLoggedIn, token] = await authJWT.isLoggedIn(req);

    if (isLoggedIn) {
        const decoded = jwt.decode(token, req.app.get('jwt_secret'));

        try {
            const sessionModel = await db.model('session').fetchByToken(decoded.sub);
            await sessionModel.destroy();
        } catch (err) {
            return res.sendStatus(200);
        }
    }

    res.sendStatus(200);
};

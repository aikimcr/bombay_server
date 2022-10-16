const jwt = require('jsonwebtoken')
const passport = require('passport')

const db = require('../lib/db')()
const authJWT = require('../passport/JWTStrategy')

exports.checkLogin = async (req, res, next) => {
    const isLoggedIn = await authJWT.isLoggedIn(req);
    res.send({ loggedIn: isLoggedIn });
}

exports.doLogin = (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, payload, done) => {
        if (err) {
            return next(err)
        }

        if (!payload) {
            return next(createError(400, 'Unknown Authentication Error'));
        }

        req.login(payload, { session: false }, err => {
            if (err) return next(err)

            const token = jwt.sign(payload, req.app.get('jwt_secret'))
            res.setHeader('Content-Type', 'application/text')
            return res.send(token)
        })
    })(req, res)
}

exports.doLogout = async (req, res, next) => {
    const isLoggedIn = await authJWT.isLoggedIn(req);

    if (isLoggedIn) {
        const token = authJWT.getToken(req);
        const decoded = jwt.decode(token, req.app.get('jwt_secret'));

        try {
            const sessionModel = await db.model('session').fetchByToken(decoded.sub)
            await sessionModel.destroy()
        } catch (err) {
            return res.sendStatus(200);
        }
    }

    res.sendStatus(200)
}


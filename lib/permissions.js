const createError = require('http-errors');

const authJWT = require('../passport/JWTStrategy');

const handlers = {};

exports.authorize = function (permissions = { login: true }) {
    authJWT.deleteStaleSessions();

    const handlerId = JSON.stringify(permissions);

    if (!handlers[handlerId]) {
        handlers[handlerId] = (req, res, next) => {
            // Refresh here.

            if (!permissions.login) {
                return next();
            }

            if (req.isAuthenticated()) {
                return next();
            }

            next(createError(403));
        };
    }

    return handlers[handlerId];
};

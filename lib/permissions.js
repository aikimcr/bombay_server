const createError = require('http-errors')
const db = require('./db')()

const handlers = {}

exports.authorize = function (permissions = { login: true }) {
    const handlerId = JSON.stringify(permissions)

    if (!handlers[handlerId]) {
        handlers[handlerId] = (req, res, next) => {
            // Refresh here.

            if (!permissions.login) {
                return next()
            }

            if (req.isAuthenticated()) {
                return next()
            }

            next(createError(403))
        }
    }

    return handlers[handlerId]
}

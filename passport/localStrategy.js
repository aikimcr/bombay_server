const LocalStrategy = require('passport-local').Strategy

const createError = require('http-errors')

const db = require('../lib/db')()

exports.getStrategy = function () {
  return new LocalStrategy(
    (username, password, done) => {
      const invalidCredentialsMessage = 'Username or password not recognized'

      db.model('user').fetchFirstByName(username)
        .then((userModel) => {
          if (password === userModel.get('password')) {
            const newToken = db.model('session').generateToken()
            const sessionStart = new Date().toISOString()

            db.model('session')
              .query('where', 'user_id', '=', userModel.get('id'))
              .fetch()
              .then(sessionModel => {
                // return sessionModel.save({
                //   session_token: newToken,
                //   session_start: sessionStart
                // }, { patch: true })
                return sessionModel
              }, err => {
                const saveOpts = {
                  session_token: newToken,
                  session_start: sessionStart,
                  user_id: userModel.get('id')
                }

                return db.model('session')
                  .forge()
                  .save(saveOpts, { method: 'insert' })
              })
              .then(sessionModel => {
                return done(null, {
                  sub: sessionModel.get('session_token'),
                  user: {
                    id: userModel.get('id'),
                    name: userModel.get('name'),
                    admin: !!userModel.get('system_admin')
                  }
                })
              })
              .catch(err => {
                return done(err, false)
              })
          } else {
            return done(createError(401, invalidCredentialsMessage), false)
          }
        })
        .catch(err => {
          return done(createError(401, invalidCredentialsMessage), false)
        })
    }
  )
}

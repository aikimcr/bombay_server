const RememberMeStrategy = require('passport-remember-me').Strategy

const db = require('../lib/db')()
const sessionTable = db.model('session')

async function checkSessionExpiration (session) {
  const sessionDuration = Date.now().valueOf() - session.session_start
  const userTable = db.model('user')

  const user = await userTable.fetchById(session.user_id)
    .catch(err => {
      return Promise.reject({ message: `Removing invalid session ${session.session_token} ${err.message}` })
    })

  const sessionExpiration = user.session_expires * 60 * 1000 // In Minutes

  if (sessionDuration > sessionExpiration) {
    session.destroy()
    return Promise.reject({ message: `Session for ${user.name} has expired` })
  }

  return user
}

function saveOpts (optsIn = {}) {
  return {
    session_token: sessionTable.generateToken(),
    session_start: Date.now(),
    ...optsIn
  }
}

exports.createSession = async function (user) {
  const session = await sessionTable.forge()
    .save(saveOpts({ user_id: user.id }), { method: 'insert' })

  return session.session_token
}

exports.updateSession = async function (session) {
  const newSession = await session.save(saveOpts(), { patch: true })
  return newSession.session_token
}

exports.getStrategy = function () {
  return new RememberMeStrategy(
    (token, done) => {
      return done(null, false, { message: 'WTF?' })
    },
    (user, done) => {
      return done(null, false, { message: 'Why' })
    }
    // // Verify session token
    // async (token, done) => {
    //     debugger;
    //     process.nextTick(async () => {
    //         sessionList = await sessionTable.collection().fetch()
    //             .catch(err => { console.warn(err) })

    //         sessionList.forEach(async session => {
    //             await checkSessionExpiration(session)
    //                 .catch(err => { console.log(err.message) })
    //         });
    //     });

    //     const session = await sessionTable.findByToken(token)
    //         .catch(err => {
    //             console.warn(err.message);
    //             return done(null, false, { message: err.message });
    //         })

    //     const user = await checkSessionExpiration(sessionList[0])
    //         .catch(err => {
    //             return done(null, false, { message: err.message });
    //         })

    //     await session.save({ session_token: null }, { patch: true })
    //         .catch(err => {
    //             return done(null, false, { message: err.message });
    //         })

    //     return done(null, user);
    // },
    // // Issue new token
    // async (user, done) => {
    //     debugger;
    //     const session = await sessionTable
    //         .where('user_id', '=', user.id)
    //         .andWhere('session_token', '=', null)
    //         .fetch()
    //         .catch(err => {
    //             createSession(user)
    //                 .then(newToken => {
    //                     return done(null, newToken)
    //                 })
    //         })

    //     const newToken = updateSession(session)
    //     return done(null, newToken)
    // }
  )
}

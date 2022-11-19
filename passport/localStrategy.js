const LocalStrategy = require('passport-local').Strategy;

const createError = require('http-errors');

const db = require('../lib/db')();

exports.getStrategy = function () {
    return new LocalStrategy(
        (username, password, done) => {
            const invalidCredentialsMessage = 'Username or password not recognized';

            db.model('user').fetchFirstByName(username)
                .then((userModel) => {
                    if (!userModel) return Promise.reject(createError(401, 'No such user'));

                    if (password === userModel.password) {
                        const newToken = db.model('session').generateToken();
                        const sessionStart = new Date().toISOString();
                        const saveOpts = {
                            session_token: newToken,
                            session_start: sessionStart,
                            user_id: userModel.id
                        };

                        return db.model('session')
                            .insert(saveOpts, { debug: false })
                            .then(sessionModel => {
                                return done(null, {
                                    sub: sessionModel.session_token,
                                    user: {
                                        id: userModel.id,
                                        name: userModel.name,
                                        admin: !!userModel.system_admin
                                    }
                                });
                            })
                            .catch(err => {
                                return done(err, false);
                            });
                    } else {
                        return done(createError(401, invalidCredentialsMessage), false);
                    }
                })
                .catch(() => {
                    return done(createError(401, invalidCredentialsMessage), false);
                });
        }
    );
};

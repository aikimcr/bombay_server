const LocalStrategy = require('passport-local').Strategy;

const db = require('../lib/db')();

exports.getStrategy = function() {
    return new LocalStrategy(
        (username, password, done) => {
            db.model('user').fetchFirstByName(username)
                .then((userModel) => {
                    if (password === userModel.get('password')) {
                        return done(null, userModel);
                    } else {
                        return done(null, false);
                    }
                })
                .catch(err => {
                    return done(null, false);
                });
        }
    );
}

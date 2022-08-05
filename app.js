const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const express = require('express');
const expressSession = require('express-session');
const logger = require('morgan');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
// const RememberMeStrategy = require('passport-remember-me').Strategy;
const path = require('path');

const db = require('./lib/db')();
const permissions = require('./lib/permissions');

const indexRouter = require('./routes/index');
const artistRouter = require('./routes/artist');

const app = express();
const port = 3000;

// So far, no need for views.
// view engine setup
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'jade');

// TODO: Add support for authentication.  But that will need support
// for https.  Which requires a certificate.  Real Soon Now.
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser('Plover-Indy-Girlfriend-Dragon'));
app.use(expressSession({
  secret: 'Plover-Indy-Girlfriend-Dragon',
  resave: false,
  saveUninitialized: true,
  coookie: { maxAge: 60000 }, // Should specifcy secure: true, but that requires https
}));

// authentication
passport.use(new LocalStrategy(
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
        return done(err);
      });
  }
));

passport.serializeUser((user, done) => {
  done(null, JSON.stringify({id: user.get('id')}));
});

passport.deserializeUser((user, done) => {
  done(null, JSON.parse(user));
});

app.use(passport.initialize());
app.use(passport.session());

// This is used to set up a public directory of simple HTML files
// I might need this later, but for now it's useless and potentially risky.
// app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/artist', permissions.authorize(), artistRouter);

app.post('/login',
  passport.authenticate('local', {  }),
  (req, res, next) => {
    res.sendStatus(200);
  },
);

app.post('/logout', (req, res, next) => {
  if (req.isAuthenticated()) {
    req.logout((err) => {
      if (err) { return next(err); }
    });
  }

  res.sendStatus(200);
})

app.use('/json', function(req, res, next) {
  // Getting multiple request to '/json' for some reason.
  // I suspect it's an attack of some sort, so I'm going to
  // make it expensive for them.
  const honey = new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 300000);
  }).then(() => {
    res.status(500);
    res.send('Nothing to see here.  Go away');
  });
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500).send(err.message);
});

module.exports = app;

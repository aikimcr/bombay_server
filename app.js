const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const express = require('express');
const expressSession = require('express-session');
const cors = require('cors');
const logger = require('morgan');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
// const RememberMeStrategy = require('passport-remember-me').Strategy;
const path = require('path');

const db = require('./lib/db')();
const permissions = require('./lib/permissions');

const indexRouter = require('./routes/index');
const artistRouter = require('./routes/artist');
const songRouter = require('./routes/song');
const { runInNewContext } = require('vm');

const app = express();

app.use(cors({
  origin: true,
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})); // There is no real need for much security here...yet?

// Both cookieParser and expressSession need a 'secret' for
// security.  Having the secret hardcoded this way isn't
// really secure.  It should come from an environment or
// runtime argument or some such.  Maybe a config.
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser('Plover-Indy-Girlfriend-Dragon'));
app.use(expressSession({
  secret: 'Plover-Indy-Girlfriend-Dragon',
  resave: false,
  saveUninitialized: true,
  coookie: { maxAge: 60000 }, // Should specify secure: true, but that requires https
}));

// authentication
passport.use(new LocalStrategy(
  (username, password, done) => {
    db.model('user').fetchFirstByName(username)
      .then((userModel) => {
        debugger;
        if (password === userModel.get('password')) {
          return done(null, userModel);
        } else {
          return done(null, false);
        }
      })
      .catch(err => {
        debugger;
        return done(null, false);
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

// Build out a baseReference for use elseqhere
app.use((req, res, next) => {
  let { hostname, path, protocol } = req;
  let location = '';
  let port = app.get('port') || process.env.port || '';

  if (req.header('X-Forwarded-Host')) {
    if (hostname !== req.header('X-Forwarded-Host')) {
      hostname = req.header('X-Forwarded-Host');
      port = '';
      protocol = 'https';

      if (req.header('X-Forwarded-Location')) {
        location = req.header('X-Forwarded-Location');
      }
    }
  }
  
  port = port.toString().length > 0 ? `:${port}` : '';
  location = location.length > 0 ? `/${location}` : '';
  location = location.replace(/^\/\/+/, '/');

  const baseRef = `${protocol}://${hostname}${port}${location}`;
  req.app.set('baseReference', baseRef);

  next();
});

// // Set up a few headers
// app.use((req, res, next) => {
//   res.set('Access-Control-Allow-Origin', '*');
//   res.set('Access-Control-Allow-Headers', 'content-type');
//   next();
// });

// This is used to set up a public directory of simple HTML files
// I might need this later, but for now it's useless and potentially risky.
// app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/artist', permissions.authorize(), artistRouter);
app.use('/song', permissions.authorize(), songRouter);

app.get('/login', (req, res, next) => {
  debugger;
  if (req.isAuthenticated()) {
    db.model('user').fetchById(req.user.id)
      .then(user => {
        res.send({
          loggedIn: true,
          user: {
            id: user.get('id'),
            name: user.get('name'),
            full_name: user.get('full_name'),
          }
        });
      })
      .catch(err => {
        res.send({loggedIn: false});
      });
  } else {
    res.send({loggedIn: false})
  }
});

app.post('/login',
  passport.authenticate('local', {  }),
  (req, res, next) => {
    debugger;
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
  debugger;
  res.status(err.status || 500).send(err.message);
});

module.exports = app;

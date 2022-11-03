const cookieParser = require('cookie-parser')
const createError = require('http-errors')
const express = require('express')
const session = require('express-session')
const cors = require('cors')
const logger = require('morgan') // I really don't know if I want this.
const passport = require('passport')

// Still need to get this from somewere else.
// Both cookieParser and jwt need a 'secret' for
// security.  Having the secret hardcoded this way isn't
// really secure.  It should come from an environment or
// runtime argument or some such.  Maybe a config.
const PloverSecret = 'Plo ver-Indy-Girlfriend-Dragon'

const db = require('./lib/db')()
const permissions = require('./lib/permissions')

const authLocal = require('./passport/localStrategy')
const authJWT = require('./passport/JWTStrategy')

const indexRouter = require('./routes/index')
const bootstrapRouter = require('./routes/bootstrap')
const loginRouter = require('./routes/login')
const artistRouter = require('./routes/artist')
const songRouter = require('./routes/song')

const app = express()
app.set('jwt_secret', PloverSecret);

app.use(cors({
  origin: true,
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
})) // There is no real need for much security here...yet?

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser(app.get('jwt_secret')))

// authentication
//    Register strategies
passport.use(authLocal.getStrategy())
passport.use(authJWT.getStrategy(app.get('jwt_secret')))

// configure Express
app.use(session({
  secret: app.get('jwt_secret'),
  resave: false,
  saveUninitialized: true,
  coookie: { maxAge: 60000 } // Should specify secure: true, but that requires https
}))
app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser((user, done) => {
  done(null, JSON.stringify({ id: user.get('id') }))
})

passport.deserializeUser((user, done) => {
  done(null, JSON.parse(user))
})

// Build out a baseReference for use elseqhere
app.use((req, res, next) => {
  let { hostname, protocol } = req
  let location = ''
  let port = app.get('port') || process.env.port || ''

  if (req.header('X-Forwarded-Host')) {
    if (hostname !== req.header('X-Forwarded-Host')) {
      hostname = req.header('X-Forwarded-Host')
      port = ''
      protocol = 'https'

      if (req.header('X-Forwarded-Location')) {
        location = req.header('X-Forwarded-Location')
      }
    }
  }

  port = port.toString().length > 0 ? `:${port}` : ''
  location = location.length > 0 ? `/${location}` : ''
  location = location.replace(/^\/\/+/, '/')

  const baseRef = `${protocol}://${hostname}${port}${location}`
  req.app.set('baseReference', baseRef)

  next()
})

// This is used to set up a public directory of simple HTML files
// I might need this later, but for now it's useless and potentially risky.
// app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter)
app.use('/bootstrap', bootstrapRouter);

app.get('/login', loginRouter.checkLogin)
app.put('/login', loginRouter.refreshToken)
app.post('/login', loginRouter.doLogin)
app.post('/logout', loginRouter.doLogout)

app.use(passport.authenticate('jwt', { session: false }))

const authware = permissions.authorize()
app.use('/artist', permissions.authorize(), artistRouter)
app.use('/song', permissions.authorize(), songRouter)

app.use('/json', function (req, res, next) {
  // Getting multiple request to '/json' for some reason.
  // I suspect it's an attack of some sort, so I'm going to
  // make it expensive for them.
  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, 300000)
  }).then(() => {
    res.status(500)
    res.send('Nothing to see here.  Go away')
  })
})

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404))
})

// error handler
app.use(function (err, req, res, next) {
  res.status(err.status || 500).send(err.message)
})

module.exports = app

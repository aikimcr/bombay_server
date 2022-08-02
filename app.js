const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const db = require('./lib/db')();

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
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/artist', artistRouter);

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

const util = require('util');
const createError = require('http-errors');
const express = require('express');
const router = express.Router();
const db = require('../lib/db')();

const Artist = db.artist;

/* Validate parameters */
router.use((req, res, next) => {
  if (req.method.toLowerCase() === 'get' || req.method.toLowerCase() === 'delete') {
    return next();
  }

  const reqBody = {...req.body};
  delete reqBody.name;
  delete reqBody.id;

  if (Object.keys(reqBody).length > 0) {
    res.status(400).send(`Unexpected data found: '${JSON.stringify(reqBody)}'`);
  } else if (!req.body.name) {
    res.status(400).send('Name must be specified');
  } else {
    return next();
  }
});

/* GET artist listing. */
router.get('/', (req, res, next) => {
  const offset = req.query.offset || 0;
  const limit = req.query.limit || 10;

  Artist
    .collection()
    .query('orderBy', 'name')
    .query('offset', offset.toString())
    .query('limit', limit.toString())
    .fetch()
    .then((collection) => {
      const data = collection.toJSON();

      if (data.length > 0) {
        let body = {
          data: data
        }
        if(data.length >= Number(limit)) {
          const port = req.app.port || 3000;
          const newOffset = `${Number(offset) + Number(limit)}`;
          body.nextPage = `${req.protocol}://${req.hostname}:${port}${req.baseUrl}${req.path}?offset=${newOffset}&limit=${limit}`;
        }
        res.send(body);
      } else {
        next(createError(404));
      }
    });
});

/* GET an artist by name */
router.get('/:name', (req, res, next) => {
  Artist
    .query('where', 'name', '=', req.params.name)
    .fetch()
    .then(model => {
      res.send(model.toJSON());
    })
    .catch(err => {
      next(createError(404));
    });
});

/* POST a new artist. */
router.post('/', (req, res, next) => {
  const reqBody = {...req.body};
  delete reqBody.name;
  delete reqBody.id;

  let saveOpts = {name: req.body.name};

  Artist.forge()
    .save(saveOpts, {debug: true})
    .then(newArtist => {
      res.send(newArtist.toJSON());
    })
    .catch(err => {
      next(err);
    });
});

/* update an artist */
router.put('/:id', (req, res, next) => {
  Artist.fetchById(req.params.id)
    .then(model => {
      return model.save({name: req.body.name}, {debug: true, patch: true});
    }, err => {
      return Promise.reject(createError(404));
    })
    .then(model => {
      res.send(model.toJSON());
    })
    .catch(err => {
      next(err);
    });
});

/* delete an artist */
router.delete('/:id', (req, res, next) => {
  Artist.fetchById(req.params.id)
    .then(model => {
      return model.destroy({debug: true});
    }, err => {
      return Promise.reject(createError(404));
    })
    .then(model => {
      res.sendStatus(200);
    })
    .catch(err => {
      next(err);
    });
});

router.use(function(err, req, res, next) {
  if (!!err.status) {
    next(err, req, res, next);
  } else {
    switch(err.code) {
      case 'SQLITE_CONSTRAINT':
        const [table, column] = err.message.match(/:\s*([^:]+)$/)[1].split('.');
        next(createError(400, `${table}: duplicate ${column} '${req.body[column]}'`));
        break;

      default: next(createError(400, 'Invalid request')); break;
    };
  }
});

module.exports = router;

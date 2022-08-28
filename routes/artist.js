const createError = require('http-errors');
const express = require('express');
const router = express.Router();
const db = require('../lib/db')();

const Artist = db.model('artist');
const tableColumns = ['name'];

/* Validate parameters */
router.use((req, res, next) => {
  switch (req.method.toLowerCase()) {
    case 'get':
    case 'delete':
      return next();

    case 'post':
    case 'put':
      const reqBody = { ...req.body };
      tableColumns.forEach((column, i) => {
        delete reqBody[column];
      });

      delete reqBody.id;

      if (Object.keys(reqBody).length > 0) {
        res.status(400).send(`Unexpected data found: '${JSON.stringify(reqBody)}'`);
      } else {
        return next();
      }
      break;

    default: res.status(500).send(`Unrecognized method ${req.method}`);
  }
});

router.use((req, res, next) => {
  switch (req.method.toLowerCase()) {
    case 'get':
    case 'delete':
      return next();

    case 'post':
    case 'put':
      if (!req.body.name) {
        res.status(400).send('Name must be specified');
        break; // Don't fall through if there's an error
      }
      return next();

    default: res.status(500).send(`Unrecognized method ${req.method}`);
  }
})

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
    .fetch({debug: false})
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
    .save(saveOpts, {method: 'insert', debug: false})
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
      return model.save({name: req.body.name}, {debug: false, patch: true});
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
      const Song = db.model('song');

      return Song
        .collection()
        .query('where', 'artist_id', '=', model.get('id'))
        .count('id')
        .then((songCount) => {
          if (songCount === 0) {
            return model.destroy({debug: false});
          } else if (songCount === 1) {
            return Promise.reject(createError(400, 'Attempt to delete artist with one reference'));
          } else {
            return Promise.reject(createError(400, `Attempt to delete artist with ${songCount} references`));
          }
        });
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

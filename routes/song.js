const createError = require('http-errors');
const express = require('express');
const router = express.Router();
const db = require('../lib/db')();

const song = db.model('song');
const tableColumns = ['name', 'artist_id', 'key_signature', 'tempo', 'lyrics'];

/* Validate parameters */
router.use((req, res, next) => {
  switch (req.method.toLowerCase()) {
    case 'get':
    case 'delete':
      return next();

    case 'post':
    case 'put':
      const reqBody = {...req.body};
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
      if (!req.body.name) {
        res.status(400).send('Name must be specified');
        break; // Don't fall through if there's an error
      } else if (!req.body.artist_id) {
        res.status(400).send('Artist ID must be specified');
        break; // Don't fall through if there's an error
      }

    case 'put':
      // Fall through from post, or come here directly for put
      if (req.body.artist_id) {
        const Artist = db.model('artist');

        Artist.fetchById(req.body.artist_id)
          .then((artistModel) => {
            return next();
          })
          .catch((err) => {
            res.status(400).send(`Invalid artist id specified: '${req.body.artist_id}'`)
          });
      } else {
        return next();
      }
      break;

    default: res.status(500).send(`Unrecognized method ${req.method}`);
  }
})

/* GET song listing. */
router.get('/', (req, res, next) => {
  const offset = req.query.offset || 0;
  const limit = req.query.limit || 10;

  song
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

/* GET an song by name */
router.get('/:name', (req, res, next) => {
  song
    .query('where', 'name', '=', req.params.name)
    .fetch()
    .then(model => {
      res.send(model.toJSON());
    })
    .catch(err => {
      next(createError(404));
    });
});

/* POST a new song. */
router.post('/', (req, res, next) => {
  const saveOpts = {};

  tableColumns.forEach((column) => {
    saveOpts[column] = req.body[column];
  });

  song.forge()
    .save(saveOpts)
    .then(newsong => {
      res.send(newsong.toJSON());
    })
    .catch(err => {
      next(err);
    });
});

/* update an song */
router.put('/:id', (req, res, next) => {
  const saveOpts = {};

  tableColumns.forEach((column) => {
    if (req.body.hasOwnProperty(column)) {
      saveOpts[column] = req.body[column];
    }
  });

  song.fetchById(req.params.id)
    .then(model => {
      return model.save(saveOpts, {patch: true});
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

/* delete an song */
router.delete('/:id', (req, res, next) => {
  song.fetchById(req.params.id)
    .then(model => {
      return model.destroy();
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
        const columns = err.message.match(/:\s*([^:]+)$/)[1].replace(/song\./g, '');
        const columnNames = columns.split(/\s*,\s*/);
        const values = columnNames.map((name) => {
          return `'${req.body[name]}'`;
        }).join(', ');
        next(createError(400, `song: duplicate ${columns} [${values}]`));
        break;

      default: next(createError(400, 'Invalid request')); break;
    };
  }
});

module.exports = router;

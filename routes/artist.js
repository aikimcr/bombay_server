const util = require('util');
const express = require('express');
const router = express.Router();
const db = require('../lib/db')();

const Artist = db.artist;

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
        res.sendStatus(404);
      }
    });
});

router.get('/:name', (req, res, next) => {
  Artist
    .query('where', 'name', '=', req.params.name)
    .fetch()
    .then(model => {
      res.send(model.toJSON());
    })
    .catch(err => {
      res.sendStatus(404);
    });
});

/* POST a new artist. */
router.post('/', (req, res, next) => {
  debugger;
  let saveOpts = {name: req.body.name};

  if (!saveOpts.name) {
    res.status(400).send('Name must be specified');
  } else {
    Artist.forge()
      .save(saveOpts, {debug: true})
      .then(newArtist => {
        res.send(newArtist.toJSON());
      });
  }
})

module.exports = router;

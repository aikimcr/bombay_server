const createError = require('http-errors');
const express = require('express');
const router = express.Router();

const db = require('../lib/db')();
const dbDebug = false;

const Song = db.model('song');
const tableColumns = ['name', 'artist_id', 'key_signature', 'tempo', 'lyrics'];

const routeUtils = require('../lib/routeUtils');

async function normalizeModel (req, model) {
    const Artist = db.model('artist');

    const url = routeUtils.getModelUrl(req, model);
    const artistModel = await Artist.fetchById(model.artist_id);

    const artist = artistModel.toJSON();
    artist.url = routeUtils.getModelUrl(req, artist, { baseUrl: 'artist' });

    return {
        ...model,
        url,
        artist
    };
}

const normalizeList = routeUtils.normalizeList(normalizeModel);

/* Validate parameters */
router.use(routeUtils.standardValidation(tableColumns));
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

    case 'put': // eslint-disable-line no-fallthrough
        // Fall through from post, or come here directly for put
        if (req.body.artist_id) {
            routeUtils.validateForeignKey('artist', req.body.artist_id)
                .then(() => {
                    return next();
                })
                .catch((err) => {
                    res.status(400).send(err.message);
                });
        } else {
            return next();
        }
        break;

    default: res.status(500).send(`Unrecognized method ${req.method}`);
    }
});

/* GET song listing. */
router.get('/', (req, res, next) => {
    const offset = req.query.offset || 0;
    const limit = req.query.limit || 10;

    Song
        .collection()
        .query('orderBy', 'name')
        .query('offset', offset.toString())
        .query('limit', limit.toString())
        .fetch({ debug: dbDebug })
        .then((collection) => {
            if (collection.length > 0) {
                const data = collection.toJSON();
                return normalizeList(req, data)
                    .catch((err) => {
                        next(err);
                    });
            } else {
                return Promise.resolve([]);
            }
        })
        .then((data) => {
            if (data?.length) {
                const refs = routeUtils.getPageUrls(req, data);

                const body = {
                    data,
                    ...refs
                };

                res.send(body);
            } else {
                next(createError(404));
            }
        });
});

/* GET an song by name or id */
router.get('/:nameorid', (req, res, next) => {
    Song
        .query('where', 'name', '=', req.params.nameorid)
        .fetch({ debug: dbDebug })
        .then(model => {
            return normalizeModel(req, model.toJSON());
        })
        .then(model => {
            res.send(model);
        })
        .catch(() => {
            if (req.params.nameorid.match(/^\d+$/)) {
                Song.fetchById(req.params.nameorid)
                    .then(model => {
                        return normalizeModel(req, model.toJSON());
                    })
                    .then(model => {
                        res.send(model);
                    })
                    .catch(() => {
                        next(createError(404));
                    });
            } else {
                next(createError(404));
            }
        });
});

/* POST a new song. */
router.post('/', (req, res, next) => {
    const defaults = {
        key_signature: '',
        tempo: null,
        lyrics: ''
    };
    const saveOpts = { ...defaults, ...req.body };
    delete saveOpts.id;

    Song.forge()
        .save(saveOpts, { debug: dbDebug })
        .then(newSong => {
            return normalizeModel(req, newSong.toJSON());
        })
        .then(newSong => {
            res.send(newSong);
        })
        .catch(err => {
            return routeUtils.routeErrorHandler(err, req, res, next);
        });
});

/* update an song */
router.put('/:id', (req, res, next) => {
    const saveOpts = {};

    tableColumns.forEach((column) => {
        if (Object.keys(req.body).includes(column)) {
            saveOpts[column] = req.body[column];
        }
    });

    Song.fetchById(req.params.id)
        .then(model => {
            return model.save(saveOpts, { patch: true, debug: dbDebug });
        }, () => {
            return Promise.reject(createError(404));
        })
        .then(model => {
            return normalizeModel(req, model.toJSON());
        })
        .then(model => {
            res.send(model);
        })
        .catch(err => {
            next(err);
        });
});

/* delete an song */
router.delete('/:id', (req, res, next) => {
    Song.fetchById(req.params.id)
        .then(model => {
            return model.destroy();
        }, () => {
            return Promise.reject(createError(404));
        })
        .then(model => {
            res.sendStatus(200);
        })
        .catch(err => {
            next(err);
        });
});

router.use(routeUtils.routeErrorHandler);

module.exports = router;

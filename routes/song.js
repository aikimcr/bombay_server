const createError = require('http-errors');
const express = require('express');
const router = express.Router();

const db = require('../lib/db')();
const dbDebug = false;

const tableColumns = ['name', 'artist_id', 'key_signature', 'tempo', 'lyrics'];

const routeUtils = require('../lib/routeUtils');

async function normalizeModel (req, model) {
    const Artist = db.model('artist');

    const url = routeUtils.getModelUrl(req, model);
    const artistModel = await Artist.fetchById(model.artist_id);

    const artist = artistModel;
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

    db.model('song')
        .select(undefined, { debug: dbDebug })
        .orderBy('name')
        .offset(offset)
        .limit(limit)
        .then((collection) => {
            if (collection.length > 0) {
                return normalizeList(req, collection)
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
    db.model('song')
        .fetchFirstByName(req.params.nameorid, { debug: dbDebug })
        .then(model => {
            if (!model) return Promise.reject(createError(404));
            return normalizeModel(req, model);
        })
        .then(model => {
            res.send(model);
        })
        .catch(() => {
            if (req.params.nameorid.match(/^\d+$/)) {
                db.model('song').fetchById(req.params.nameorid, { debug: dbDebug })
                    .then(model => {
                        if (!model) return Promise.reject(createError(404));
                        return normalizeModel(req, model);
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

    db.model('song')
        .insert(saveOpts, { debug: dbDebug })
        .then(newSong => {
            return normalizeModel(req, newSong);
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

    db.model('song')
        .update(saveOpts, { debug: dbDebug })
        .where('id', '=', req.params.id)
        .then(model => {
            if (model.length === 0) {
                return Promise.reject(createError(404, 'Not Found'));
            }

            return normalizeModel(req, model[0]);
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
    db.model('song').fetchById(req.params.id)
        .then(model => {
            if (!model) return Promise.reject(createError(404, 'Not Found'));

            return db.model('song')
                .del({ debug: dbDebug })
                .where('id', '=', model.id);
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

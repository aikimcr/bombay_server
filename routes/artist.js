const createError = require('http-errors');
const express = require('express');
const router = express.Router();

const db = require('../lib/db')();
const dbDebug = false;

const tableColumns = ['name'];

const routeUtils = require('../lib/routeUtils');

async function normalizeModel (req, model) {
    const url = routeUtils.getModelUrl(req, model);

    return {
        ...model,
        url
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
    case 'put':
        if (!req.body.name) {
            res.status(400).send('Name must be specified');
            break; // Don't fall through if there's an error
        }
        return next();

    default: res.status(500).send(`Unrecognized method ${req.method}`);
    }
});

/* GET artist listing. */
router.get('/', (req, res, next) => {
    const offset = req.query.offset || 0;
    const limit = req.query.limit || 10;

    db.model('artist')
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
        })
        .catch(err => {
            next(err);
        });
});

/* GET an artist by name */
router.get('/:nameorid', (req, res, next) => {
    db.model('artist')
        .fetchFirstByName(req.params.nameorid, { debug: dbDebug })
        .then(model => {
            return normalizeModel(req, model);
        })
        .then((model) => {
            res.send(model);
        })
        .catch(() => {
            if (req.params.nameorid.match(/^\d+$/)) {
                db.model('artist').fetchById(req.params.nameorid, { debug: dbDebug })
                    .then(model => {
                        return normalizeModel(req, model);
                    })
                    .then((model) => {
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

/* POST a new artist. */
router.post('/', (req, res, next) => {
    const defaults = {};
    const saveOpts = { ...defaults, ...req.body };
    delete saveOpts.id;

    db.model('artist')
        .insert(saveOpts, { debug: dbDebug })
        .then(newArtist => {
            return normalizeModel(req, newArtist);
        })
        .then(newArtist => {
            res.send(newArtist);
        })
        .catch(err => {
            next(err);
        });
});

/* update an artist */
router.put('/:id', (req, res, next) => {
    db.model('artist')
        .update({ name: req.body.name }, { debug: dbDebug })
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

/* delete an artist */
router.delete('/:id', (req, res, next) => {
    db.model('artist').fetchById(req.params.id)
        .then(model => {
            if (!model) return Promise.reject(createError(404, 'Not Found'));

            return db.model('song')
                .count({ debug: dbDebug })
                .where('artist_id', '=', model.id)
                .then((songCount) => {
                    if (songCount[0].rows === 0) {
                        return db.model('artist')
                            .del({ debug: dbDebug })
                            .where('id', '=', model.id);
                    } else if (songCount[0].rows === 1) {
                        return Promise.reject(createError(400, 'Attempt to delete artist with one reference'));
                    } else {
                        return Promise.reject(createError(400, `Attempt to delete artist with ${songCount[0].rows} references`));
                    }
                });
        }, (err) => {
            return Promise.reject(err);
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

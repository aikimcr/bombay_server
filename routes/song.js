const createError = require('http-errors')
const express = require('express')
const router = express.Router()

const db = require('../lib/db')()
const dbDebug = false

const Song = db.model('song')
const tableColumns = ['name', 'artist_id', 'key_signature', 'tempo', 'lyrics']

const routeUtils = require('../lib/routeUtils')

async function normalizeModel (req, model) {
  const Artist = db.model('artist')

  const url = routeUtils.getModelUrl(req, model)
  const artistModel = await Artist.fetchById(model.artist_id)

  const artist = artistModel.toJSON()
  artist.url = routeUtils.getModelUrl(req, artist, { baseUrl: 'artist' })

  return {
    ...model,
    url,
    artist
  }
}

async function normalizeList (req, list) {
  const newList = await list.map(async (model) => {
    const newModel = await normalizeModel(req, model)
    return newModel
  })

  return Promise.all(newList)
}

/* Validate parameters */
router.use((req, res, next) => {
  switch (req.method.toLowerCase()) {
    case 'get':
    case 'delete':
      return next()

    case 'post':
    case 'put':
      const reqBody = { ...req.body }
      tableColumns.forEach((column, i) => {
        delete reqBody[column]
      })

      delete reqBody.id

      if (Object.keys(reqBody).length > 0) {
        res.status(400).send(`Unexpected data found: '${JSON.stringify(reqBody)}'`)
      } else {
        return next()
      }
      break

    default: res.status(500).send(`Unrecognized method ${req.method}`)
  }
})

router.use((req, res, next) => {
  switch (req.method.toLowerCase()) {
    case 'get':
    case 'delete':
      return next()

    case 'post':
      if (!req.body.name) {
        res.status(400).send('Name must be specified')
        break // Don't fall through if there's an error
      } else if (!req.body.artist_id) {
        res.status(400).send('Artist ID must be specified')
        break // Don't fall through if there's an error
      }

    case 'put':
      // Fall through from post, or come here directly for put
      if (req.body.artist_id) {
        const Artist = db.model('artist')

        Artist.fetchById(req.body.artist_id)
          .then((artistModel) => {
            return next()
          })
          .catch((err) => {
            res.status(400).send(`Invalid artist id specified: '${req.body.artist_id}'`)
          })
      } else {
        return next()
      }
      break

    default: res.status(500).send(`Unrecognized method ${req.method}`)
  }
})

/* GET song listing. */
router.get('/', (req, res, next) => {
  const offset = req.query.offset || 0
  const limit = req.query.limit || 10

  Song
    .collection()
    .query('orderBy', 'name')
    .query('offset', offset.toString())
    .query('limit', limit.toString())
    .fetch({ debug: dbDebug })
    .then((collection) => {
      if (collection.length > 0) {
        const data = collection.toJSON()
        return normalizeList(req, data)
          .catch((err) => {
            next(err)
          })
      } else {
        return Promise.resolve([])
      }
    })
    .then((data) => {
      if (data?.length) {
        const refs = routeUtils.getPageUrls(req, data)

        const body = {
          data,
          ...refs
        }

        res.send(body)
      } else {
        next(createError(404))
      }
    })
})

/* GET an song by name or id */
router.get('/:nameorid', (req, res, next) => {
  Song
    .query('where', 'name', '=', req.params.nameorid)
    .fetch({ debug: dbDebug })
    .then(model => {
      return normalizeModel(req, model.toJSON())
    })
    .then(model => {
      res.send(model)
    })
    .catch(err => {
      if (req.params.nameorid.match(/^\d+$/)) {
        Song.fetchById(req.params.nameorid)
          .then(model => {
            return normalizeModel(req, model.toJSON())
          })
          .then(model => {
            res.send(model)
          })
          .catch(err => {
            next(createError(404))
          })
      } else {
        next(createError(404))
      }
    })
})

/* POST a new song. */
router.post('/', (req, res, next) => {
  const saveOpts = {}

  tableColumns.forEach((column) => {
    saveOpts[column] = req.body[column]
  })

  Song.forge()
    .save(saveOpts, { debug: dbDebug })
    .then(newSong => {
      return normalizeModel(req, newSong.toJSON())
    })
    .then(newSong => {
      res.send(newSong)
    })
    .catch(err => {
      next(err)
    })
})

/* update an song */
router.put('/:id', (req, res, next) => {
  const saveOpts = {}

  tableColumns.forEach((column) => {
    if (req.body.hasOwnProperty(column)) {
      saveOpts[column] = req.body[column]
    }
  })

  Song.fetchById(req.params.id)
    .then(model => {
      return model.save(saveOpts, { patch: true, debug: dbDebug })
    }, err => {
      return Promise.reject(createError(404))
    })
    .then(model => {
      return normalizeModel(req, model.toJSON())
    })
    .then(model => {
      res.send(model)
    })
    .catch(err => {
      next(err)
    })
})

/* delete an song */
router.delete('/:id', (req, res, next) => {
  Song.fetchById(req.params.id)
    .then(model => {
      return model.destroy()
    }, err => {
      return Promise.reject(createError(404))
    })
    .then(model => {
      res.sendStatus(200)
    })
    .catch(err => {
      next(err)
    })
})

router.use(function (err, req, res, next) {
  if (err.status) {
    next(err, req, res, next)
  } else {
    switch (err.code) {
      case 'SQLITE_CONSTRAINT':
        const columns = err.message.match(/:\s*([^:]+)$/)[1].replace(/song\./g, '')
        const columnNames = columns.split(/\s*,\s*/)
        const values = columnNames.map((name) => {
          return `'${req.body[name]}'`
        }).join(', ')
        next(createError(400, `song: duplicate ${columns} [${values}]`))
        break

      default: next(createError(400, 'Invalid request')); break
    };
  }
})

module.exports = router

const request = require('supertest')
const faker = require('@faker-js/faker').faker

require('should')

// TODO: This connection boilerplate doesn't really belong here.
const db = require('../lib/db')({
  connection: ':memory:',
  pool: {
    min: 1,
    max: 1,
    disposeTimeout: 360000 * 1000,
    idleTimeoutMillis: 360000 * 1000
  }
})

const testDb = require('./lib/db')

after(function () {
  db.knex.destroy((err) => {
    console.log(err)
  })
})

describe('song', function () {
  const tableName = 'song'
  const Song = db.model(tableName)

  const testData = {}
  let artists = []
  let artistIds = []

  function buildModel(args) {
    const fakeName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
    const fakeId = artistIds[faker.datatype.number(artistIds.length - 1)]
    return {
      name: fakeName,
      artist_id: fakeId,
      key_signature: '',
      tempo: '',
      lyrics: '',
      ...args
    }
  }

  beforeEach(function (done) {
    testDb.buildSchema()
      .then(() => {
        return testDb.loadTable('artist', 25, (args) => {
          const fakeName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
          return { name: fakeName, ...args }
        })
      })
      .then((artistModels) => {
        artists = artistModels

        artistIds = artists.map(artist => {
          return artist.get('id')
        })

        return testDb.loadTable(tableName, 25, buildModel)
      })
      .then((songs) => {
        testDb.stubPermissions()
        testDb.stubArtist()
        testDb.stubSong()
      })
      .then(() => {
        testData.newName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
        testData.findName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
        return testDb.getTestModel(tableName, 2)
      })
      .then((testModel) => {
        testData.model = testModel
        return testDb.getNextId(tableName)
      })
      .then((newId) => {
        testData.newId = newId
        testData.findId = newId + 100
        return testDb.getTestModel(tableName, 4)
      })
      .then((dupModel) => {
        const app = require('../app.js')
        testData.duplicate = dupModel
        testData.request = request(app)
        done()
      })
      .catch((err) => {
        done(err)
      })
  })

  describe('get', function () {
    describe('collection', function () {
      function bodyExpect(queryExpect) {
        const query = testDb.parseQueryArgs(queryExpect)
        const newOffset = query.offset + query.limit
        const queryBuilder = db.knex(tableName)
        queryExpect.forEach((arg) => {
          if (arg.length > 0) {
            queryBuilder[arg[0]](arg.slice(1))
          }
        })

        return queryBuilder.select()
          .then((result) => {
            const body = { data: result }

            if (body.data.length >= query.limit) {
              body.nextPage = `http://127.0.0.1:3000/song/?offset=${newOffset}&limit=${query.limit}`
            }

            return Promise.resolve(body)
          })
      };

      it('should return all the rows in page one', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '0'],
          ['limit', '10'],
          []
        ]

        testData.request
          .get('/song')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            testDb.songCollection.query.args.should.deepEqual(queryExpect)
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation)
                done()
              })
          })
      })

      it('should return the next page of rows', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '10'],
          ['limit', '10'],
          []
        ]

        testData.request
          .get('/song?offset=10&limit=10')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            testDb.songCollection.query.args.should.deepEqual(queryExpect)
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation)
                done()
              })
          })
      })

      it('should return partial page', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '20'],
          ['limit', '10'],
          []
        ]

        testData.request
          .get('/song?offset=20&limit=10')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            testDb.songCollection.query.args.should.deepEqual(queryExpect)
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation)
                done()
              })
          })
      })

      it('should return a 404', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '30'],
          ['limit', '10'],
          []
        ]

        testData.request
          .get('/song?offset=30&limit=10')
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            testDb.songCollection.query.args.should.deepEqual(queryExpect)
            res.body.should.deepEqual({})
            res.text.should.equal('Not Found')
            done()
          })
      })
    })

    describe('model', function () {
      it('should return the specified row by name', function (done) {
        testData.request
          .get(`/song/${testData.model.name}`)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'name', '=', testData.model.name]
            ])
            res.body.should.deepEqual(testData.model)
            done()
          })
      })

      it('should return 404 if name does not exist', function (done) {
        testData.request
          .get(`/song/${testData.findName}`)
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'name', '=', testData.findName]
            ])
            res.body.should.deepEqual({})
            res.text.should.equal('Not Found')
            done()
          })
      })
    })
  })

  describe('post', function () {
    describe('model', function () {
      it('should add a new record with a new id', function (done) {
        const model = buildModel({ name: testData.newName });
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({
              id: testData.newId,
              ...model,
            })
            done()
          })
      })

      it('should override the specified id', function (done) {
        const model = buildModel({ id: 1, name: testData.newName });
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({
              ...model,
              id: testData.newId,
            })
            done()
          })
      })

      it('should reject on missing name', function (done) {
        const model = buildModel({});
        delete model.name;
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal('Name must be specified')
            done()
          })
      })

      it('should reject on missing artist_id', function (done) {
        const model = buildModel({});
        delete model.artist_id;
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal('Artist ID must be specified')
            done()
          })
      })

      it('should reject on duplicate name/artist_id', function (done) {
        const model = buildModel({});
        model.name = testData.duplicate.name;
        model.artist_id = testData.duplicate.artist_id;
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal(`song: duplicate name, artist_id ['${testData.duplicate.name}', '${testData.duplicate.artist_id}']`)
            done()
          })
      })

      it('should reject on invalid artist_id', function (done) {
        const model = buildModel({});
        model.artist_id = Math.max(...artistIds) + 10;
        testData.request
          .post('/song')
          .send(model)
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal(`Invalid artist id specified: '${model.artist_id}'`)
            done()
          })
      })

      it('should reject on extraneous fields', function (done) {
        testData.request
          .post('/song')
          .send({ name: testData.newName, gender: 'male', age: '156' })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal('Unexpected data found: \'{"gender":"male","age":"156"}\'')
            done()
          })
      })
    })
  })

  describe('put', function () {
    describe('model', function () {
      it('should update the song name', function (done) {
        testData.request
          .put(`/song/${testData.model.id}`)
          .send({ name: testData.newName })
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()]
            ])
            res.body.should.deepEqual({
              ...testData.model,
              name: testData.newName,
            })
            done()
          })
      })

      it('should update the artist id', function (done) {
        let newArtistId = testData.model.artist_id + 1;
        let artistIdIdx = artistIds.indexOf(newArtistId);

        if (artistIdIdx === -1) {
          newArtistId = artistIds[0];
        }

        testData.request
          .put(`/song/${testData.model.id}`)
          .send({ artist_id: newArtistId })
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()]
            ])
            res.body.should.deepEqual({
              ...testData.model,
              artist_id: newArtistId,
            })
            done()
          })
      })

      it('should reject on a duplicate name/artist_id', function (done) {
        testData.request
          .put(`/song/${testData.model.id}`)
          .send({
            name: testData.duplicate.name,
            artist_id: testData.duplicate.artist_id,
          })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()]
            ])
            res.body.should.deepEqual({})
            res.text.should.equal(`song: duplicate name, artist_id ['${testData.duplicate.name}', '${testData.duplicate.artist_id}']`)
            done()
          })
      })

      it('should reject on an invalid artist id', function (done) {
        const newArtistId = Math.max(...artistIds) + 10;
        testData.request
          .put(`/song/${testData.model.id}`)
          .send({ artist_id: newArtistId })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([])
            res.body.should.deepEqual({})
            res.text.should.equal(`Invalid artist id specified: '${newArtistId}'`)
            done()
          })
      })

      it('should return 404 on non-existent id', function (done) {
        testData.request
          .put(`/song/${testData.findId}`)
          .send({ name: testData.newName })
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.findId.toString()]
            ])
            res.body.should.deepEqual({})
            res.text.should.equal('Not Found')
            done()
          })
      })
    })
  })

  describe('delete', function () {
    describe('model', function () {
      it('should delete the model from the datatbase', function (done) {
        testData.request
          .delete(`/song/${testData.model.id}`)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /text\/plain/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()]
            ])
            res.body.should.deepEqual({})
            res.text.should.equal('OK')
            done()
          })
      })

      it('should return 404 on non-existent id', function (done) {
        testData.request
          .delete(`/song/${testData.findId}`)
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err
            Song.query.args.should.deepEqual([
              ['where', 'id', '=', testData.findId.toString()]
            ])
            res.body.should.deepEqual({})
            res.text.should.equal('Not Found')
            done()
          })
      })
    })
  })
})

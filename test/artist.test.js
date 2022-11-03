require('should')

// This db require must come before any other project module requires to
// prevent corrupting the actual database.
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

after(() => {
    db.knex.destroy((err) => {
        console.log(err)
    })
})

describe('artist', function () {
    const tableName = 'artist'
    const Artist = db.model(tableName)

    let testData = null

    beforeEach(function (done) {
        testDb.buildSchema()
            .then(() => {
                return testDb.tableDefs.loadModels({ artist: true })
            })
            .then(() => {
                return testDb.getTestData(tableName)
            })
            .then((td) => {
                testData = td
                return testDb.getTestModel('user')
            })
            .then(testUser => {
                testData.user = testUser
                done()
            })
            .catch((err) => {
                done(err)
            })
    })

    describe('get', function () {
        describe('collection', function () {
            function bodyExpect (queryExpect) {
                const query = testDb.parseQueryArgs(queryExpect)
                const queryBuilder = db.knex(tableName)
                queryExpect.forEach((arg) => {
                    if (arg.length > 0) {
                        queryBuilder[arg[0]](arg.slice(1))
                    }
                })

                return queryBuilder.select()
                    .then((result) => {
                        const body = {
                            data: result.map((row) => {
                                return {
                                    ...row,
                                    url: `http://127.0.0.1/artist/${row.id}`
                                }
                            })
                        }

                        if (body.data.length >= query.limit) {
                            const newOffset = query.offset + query.limit
                            body.nextPage = `http://127.0.0.1/artist/?offset=${newOffset}&limit=${query.limit}`
                        }

                        if (query.offset > 0) {
                            const newOffset = Math.max(query.offset - query.limit, 0)
                            body.prevPage = `http://127.0.0.1/artist/?offset=${newOffset}&limit=${query.limit}`
                        }

                        return Promise.resolve(body)
                    })
                    .catch((err) => {
                        console.log(err)
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
                    .get('/artist')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        testDb.artistCollection.query.args.should.deepEqual(queryExpect)
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation)
                                done()
                            })
                            .catch((err) => {
                                done(err)
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
                    .get('/artist?offset=10&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        testDb.artistCollection.query.args.should.deepEqual(queryExpect)
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation)
                                done()
                            })
                            .catch((err) => {
                                done(err)
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
                    .get('/artist?offset=20&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        testDb.artistCollection.query.args.should.deepEqual(queryExpect)
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation)
                                done()
                            })
                            .catch((err) => {
                                done(err)
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
                    .get('/artist?offset=30&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        testDb.artistCollection.query.args.should.deepEqual(queryExpect)
                        res.body.should.deepEqual({})
                        res.text.should.equal('Not Found')
                        done()
                    })
            })
        })

        describe('model', function () {
            it('should return the specified row by name', function (done) {
                testData.request
                    .get(`/artist/${testData.model.name}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
                            ['where', 'name', '=', testData.model.name]
                        ])
                        res.body.should.deepEqual({
                            ...testData.model,
                            url: `http://127.0.0.1/artist/${testData.model.id}`
                        })
                        done()
                    })
            })

            it('should return the specified row by id', function (done) {
                testData.request
                    .get(`/artist/${testData.model.id}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
                            ['where', 'name', '=', testData.model.id.toString()],
                            ['where', 'id', '=', testData.model.id.toString()]
                        ])
                        res.body.should.deepEqual({
                            ...testData.model,
                            url: `http://127.0.0.1/artist/${testData.model.id}`
                        })
                        done()
                    })
            })

            it('should return 404 if name does not exist', function (done) {
                testData.request
                    .get(`/artist/${testData.findName}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
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
                testData.request
                    .post('/artist')
                    .send({ name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([])
                        res.body.should.deepEqual({
                            id: testData.newId,
                            name: testData.newName,
                            url: `http://127.0.0.1/artist/${testData.newId}`
                        })
                        done()
                    })
            })

            it('should override the specified id', function (done) {
                testData.request
                    .post('/artist')
                    .send({ id: 1, name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([])
                        res.body.should.deepEqual({
                            id: testData.newId,
                            name: testData.newName,
                            url: `http://127.0.0.1/artist/${testData.newId}`
                        })
                        done()
                    })
            })

            it('should reject on missing name', function (done) {
                testData.request
                    .post('/artist')
                    .send({})
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([])
                        res.body.should.deepEqual({})
                        res.text.should.equal('Name must be specified')
                        done()
                    })
            })

            it('should reject on duplicate name', function (done) {
                testData.request
                    .post('/artist')
                    .send({ name: testData.duplicate.name })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([])
                        res.body.should.deepEqual({})
                        res.text.should.match(/^Invalid request SQL UNIQUE CONSTRAINT \(\{.*\}\)$/)
                        done()
                    })
            })

            it('should reject on extraneous fields', function (done) {
                testData.request
                    .post('/artist')
                    .send({ name: testData.newName, gender: 'male', age: '156' })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([])
                        res.body.should.deepEqual({})
                        res.text.should.equal('Unexpected data found: \'{"gender":"male","age":"156"}\'')
                        done()
                    })
            })
        })
    })

    describe('put', function () {
        describe('model', function () {
            it('should update the artist name', function (done) {
                testData.request
                    .put(`/artist/${testData.model.id}`)
                    .send({ name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
                            ['where', 'id', '=', testData.model.id.toString()]
                        ])
                        res.body.should.deepEqual({
                            id: testData.model.id,
                            name: testData.newName,
                            url: `http://127.0.0.1/artist/${testData.model.id}`
                        })
                        done()
                    })
            })

            it('should reject on a duplicate name', function (done) {
                testData.request
                    .put(`/artist/${testData.model.id}`)
                    .send({ name: testData.duplicate.name })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
                            ['where', 'id', '=', testData.model.id.toString()]
                        ])
                        res.body.should.deepEqual({})
                        res.text.should.match(/^Invalid request SQL UNIQUE CONSTRAINT \(\{.*\}\)$/)
                        done()
                    })
            })

            it('should return 404 on non-existent id', function (done) {
                testData.request
                    .put(`/artist/${testData.findId}`)
                    .send({ name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
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
                    .delete(`/artist/${testData.model.id}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /text\/plain/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
                            ['where', 'id', '=', testData.model.id.toString()]
                        ])
                        res.body.should.deepEqual({})
                        res.text.should.equal('OK')
                        done()
                    })
            })

            it('should reject if id is referenced by a song', function (done) {
                const Song = db.model('song')
                const songModel = testDb.tableDefs.song.buildModel({ artist_id: testData.model.id })
                Song.forge().save(songModel, { method: 'insert' })
                    .then((newSong) => {
                        testData.request
                            .delete(`/artist/${testData.model.id}`)
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(400)
                            .expect('Content-Type', /text\/html/)
                            .end(function (err, res) {
                                if (err) throw err
                                Artist.query.args.should.deepEqual([
                                    ['where', 'id', '=', testData.model.id.toString()]
                                ])
                                res.body.should.deepEqual({})
                                res.text.should.equal('Attempt to delete artist with one reference')
                                done()
                            })
                    })
            })

            it('should reject if id is referenced by multiple songs', function (done) {
                const Song = db.model('song')
                const songModel1 = testDb.tableDefs.song.buildModel({ artist_id: testData.model.id })
                const songModel2 = testDb.tableDefs.song.buildModel({ artist_id: testData.model.id })

                Song.forge().save(songModel1, { method: 'insert' })
                    .then((newSong) => {
                        return Song.forge().save(songModel2, { method: 'insert' })
                    })
                    .then((newSong2) => {
                        testData.request
                            .delete(`/artist/${testData.model.id}`)
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(400).expect('Content-Type', /text\/html/)
                            .end(function (err, res) {
                                if (err) throw err
                                Artist.query.args.should.deepEqual([
                                    ['where', 'id', '=', testData.model.id.toString()]
                                ])
                                res.body.should.deepEqual({})
                                res.text.should.equal('Attempt to delete artist with 2 references')
                                done()
                            })
                    })
            })

            it('should return 404 on non-existent id', function (done) {
                testData.request
                    .delete(`/artist/${testData.findId}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err
                        Artist.query.args.should.deepEqual([
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

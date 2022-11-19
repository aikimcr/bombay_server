const faker = require('@faker-js/faker').faker;

require('should');

// TODO: This connection boilerplate doesn't really belong here.
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
});
const testDb = require('./lib/db');

after(() => {
    db.knex.destroy((err) => {
        console.log(err);
    });
});

describe('song', function () {
    const tableName = 'song';
    const Song = db.model(tableName);

    let testData = null;

    beforeEach(function (done) {
        const Artist = db.model('artist');

        testDb.buildSchema()
            .then(() => {
                return testDb.tableDefs.loadModels({ artist: true, song: true });
            })
            .then(() => {
                return testDb.getTestData(tableName);
            })
            .then(td => {
                testData = td;
                return Artist.fetchById(testData.model.artist_id);
            })
            .then(artist => {
                testData.artist = {
                    ...artist,
                    url: `http://127.0.0.1/artist/${artist.id}`
                };

                done();
            })
            .catch((err) => {
                done(err);
            });
    });

    describe('get', function () {
        describe('collection', function () {
            function bodyExpect (queryExpect) {
                const query = testDb.parseQueryArgs(queryExpect);
                const queryBuilder = db.knex(tableName);
                queryExpect.forEach((arg) => {
                    if (arg.length > 0) {
                        queryBuilder[arg[0]](arg.slice(1));
                    }
                });

                return queryBuilder.select()
                    .then((result) => {
                        const Artist = db.model('artist');

                        const artistPromises = result.map(row => {
                            return Artist.fetchById(row.artist_id)
                                .then(artist => {
                                    const artistJSON = {
                                        ...artist,
                                        url: `http://127.0.0.1/artist/${artist.id}`
                                    };
                                    return Promise.resolve({
                                        ...row,
                                        url: `http://127.0.0.1/song/${row.id}`,
                                        artist: artistJSON
                                    });
                                });
                        });

                        return Promise.all(artistPromises);
                    })
                    .then(result => {
                        const body = {
                            data: result
                        };

                        if (body.data.length >= query.limit) {
                            const newOffset = query.offset + query.limit;
                            body.nextPage = `http://127.0.0.1/song/?offset=${newOffset}&limit=${query.limit}`;
                        }

                        if (query.offset > 0) {
                            const newOffset = Math.max(query.offset - query.limit, 0);
                            body.prevPage = `http://127.0.0.1/song/?offset=${newOffset}&limit=${query.limit}`;
                        }

                        return Promise.resolve(body);
                    });
            };

            it('should return all the rows in page one', function (done) {
                const queryExpect = [
                    ['orderBy', 'name'],
                    ['offset', '0'],
                    ['limit', '10'],
                    []
                ];

                testData.request
                    .get('/song')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;
                        const actualSQL = db.model('song').select.returnValues[0].toString();
                        actualSQL.should.equal('select * from `song` order by `name` asc limit 10');
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation);
                                done();
                            })
                            .catch((err) => {
                                done(err);
                            });
                    });
            });

            it('should return the next page of rows', function (done) {
                const queryExpect = [
                    ['orderBy', 'name'],
                    ['offset', '10'],
                    ['limit', '10'],
                    []
                ];

                testData.request
                    .get('/song?offset=10&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;
                        const actualSQL = db.model('song').select.returnValues[0].toString();
                        actualSQL.should.equal('select * from `song` order by `name` asc limit 10 offset 10');
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation);
                                done();
                            })
                            .catch((err) => {
                                done(err);
                            });
                    });
            });

            it('should return partial page', function (done) {
                const queryExpect = [
                    ['orderBy', 'name'],
                    ['offset', '20'],
                    ['limit', '10'],
                    []
                ];

                testData.request
                    .get('/song?offset=20&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;
                        const actualSQL = db.model('song').select.returnValues[0].toString();
                        actualSQL.should.equal('select * from `song` order by `name` asc limit 10 offset 20');
                        bodyExpect(queryExpect)
                            .then(function (expectation) {
                                res.body.should.deepEqual(expectation);
                                done();
                            })
                            .catch((err) => {
                                done(err);
                            });
                    });
            });

            it('should return a 404', function (done) {
                testData.request
                    .get('/song?offset=30&limit=10')
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;
                        const actualSQL = db.model('song').select.returnValues[0].toString();
                        actualSQL.should.equal('select * from `song` order by `name` asc limit 10 offset 30');
                        res.body.should.deepEqual({});
                        res.text.should.equal('Not Found');
                        done();
                    });
            });
        });

        describe('model', function () {
            it('should return the specified row by name', function (done) {
                testData.request
                    .get(`/song/${testData.model.name}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').fetchFirstByName.calledWith(testData.model.name).should.be.true();

                        db.model('song').fetchById.notCalled.should.be.true();

                        res.body.should.deepEqual({
                            ...testData.model,
                            url: `http://127.0.0.1/song/${testData.model.id}`,
                            artist: testData.artist
                        });
                        done();
                    });
            });

            it('should return the specified row by id', function (done) {
                testData.request
                    .get(`/song/${testData.model.id}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;

                        // First it will try to get it by name
                        db.model('song').fetchFirstByName.args[0].should.deepEqual([testData.model.id.toString(), { debug: false }]);

                        // Then it will fetch it by id
                        db.model('song').fetchById.args[0].should.deepEqual([testData.model.id.toString(), { debug: false }]);

                        res.body.should.deepEqual({
                            ...testData.model,
                            url: `http://127.0.0.1/song/${testData.model.id}`,
                            artist: testData.artist
                        });
                        done();
                    });
            });

            it('should return 404 if name does not exist', function (done) {
                testData.request
                    .get(`/song/${testData.findName}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        // First it will try to get it by name
                        db.model('song').fetchFirstByName.args[0].should.deepEqual([testData.findName.toString(), { debug: false }]);

                        // But it will not try to fetch by id because the name doesn't look like an id.
                        db.model('song').fetchById.notCalled.should.be.true();

                        res.body.should.deepEqual({});
                        res.text.should.equal('Not Found');
                        done();
                    });
            });
        });
    });

    describe('post', function () {
        describe('model', function () {
            it('should add a new record with a new id', function (done) {
                const model = testDb.tableDefs.song.buildModel({ name: testData.newName });
                const Artist = db.model('artist');

                Artist.fetchById(model.artist_id)
                    .then(artistModel => {
                        const artist = {
                            ...artistModel,
                            url: `http://127.0.0.1/artist/${model.artist_id}`
                        };

                        testData.request
                            .post('/song')
                            .send(model)
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(200)
                            .expect('Content-Type', /json/)
                            .end(function (err, res) {
                                if (err) throw err;

                                db.model('song').insert.args[0].should.deepEqual([
                                    { ...model, name: testData.newName },
                                    { debug: false } // This should be the normal state.
                                ]);

                                res.body.should.deepEqual({
                                    id: testData.newId,
                                    ...model,
                                    url: `http://127.0.0.1/song/${testData.newId}`,
                                    artist
                                });
                                done();
                            });
                    });
            });

            it('should override the specified id', function (done) {
                const model = testDb.tableDefs.song.buildModel({ id: 1, name: testData.newName });
                const Artist = db.model('artist');

                Artist.fetchById(model.artist_id)
                    .then(artistModel => {
                        const artist = {
                            ...artistModel,
                            url: `http://127.0.0.1/artist/${model.artist_id}`
                        };

                        testData.request
                            .post('/song')
                            .send(model)
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(200)
                            .expect('Content-Type', /json/)
                            .end(function (err, res) {
                                if (err) throw err;

                                const argsModel = { ...model };
                                delete argsModel.id;

                                db.model('song').insert.args[0].should.deepEqual([
                                    argsModel,
                                    { debug: false } // This should be the normal state.
                                ]);

                                res.body.should.deepEqual({
                                    ...model,
                                    id: testData.newId,
                                    url: `http://127.0.0.1/song/${testData.newId}`,
                                    artist
                                });
                                done();
                            });
                    });
            });

            it('should reject on missing name', function (done) {
                const model = testDb.tableDefs.song.buildModel({});
                delete model.name;
                testData.request
                    .post('/song')
                    .send(model)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;
                        db.model('song').insert.notCalled.should.be.true();
                        res.body.should.deepEqual({});
                        res.text.should.equal('Name must be specified');
                        done();
                    });
            });

            it('should reject on missing artist_id', function (done) {
                const model = testDb.tableDefs.song.buildModel({});
                delete model.artist_id;
                testData.request
                    .post('/song')
                    .send(model)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;
                        db.model('song').insert.notCalled.should.be.true();
                        res.body.should.deepEqual({});
                        res.text.should.equal('Artist ID must be specified');
                        done();
                    });
            });

            it('should fill in missing fields', function (done) {
                const testName = faker.helpers.unique(faker.name.fullName);

                testDb.getTestModel('artist')
                    .then(artistModel => {
                        artistModel.url = `http://127.0.0.1/artist/${artistModel.id}`;

                        testData.request
                            .post('/song')
                            .send({ name: testName, artist_id: artistModel.id })
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(200)
                            .expect('Content-Type', /json/)
                            .end(function (err, res) {
                                if (err) throw err;

                                db.model('song').insert.args[0].should.deepEqual([
                                    {
                                        name: testName,
                                        artist_id: artistModel.id,
                                        key_signature: '',
                                        tempo: null,
                                        lyrics: ''
                                    },
                                    { debug: false } // This should be the normal state.
                                ]);

                                res.body.should.deepEqual({
                                    id: testData.newId,
                                    name: testName,
                                    artist_id: artistModel.id,
                                    key_signature: '',
                                    tempo: null,
                                    lyrics: '',
                                    url: `http://127.0.0.1/song/${testData.newId}`,
                                    artist: artistModel
                                });
                                done();
                            });
                    });
            });

            it('should reject on duplicate name/artist_id', function (done) {
                const model = testDb.tableDefs.song.buildModel({});
                model.name = testData.duplicate.name;
                model.artist_id = testData.duplicate.artist_id;
                testData.request
                    .post('/song')
                    .send(model)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').insert.args[0].should.deepEqual([
                            model,
                            { debug: false } // This should be the normal state.
                        ]);

                        res.body.should.deepEqual({});
                        res.text.should.match(/^Invalid request SQL UNIQUE CONSTRAINT \(\{.*\}\)$/);
                        done();
                    });
            });

            it('should reject on invalid artist_id', function (done) {
                const model = testDb.tableDefs.song.buildModel({});
                model.artist_id = Math.max(...testDb.tableDefs.artist.ids) + 10;
                testData.request
                    .post('/song')
                    .send(model)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').insert.notCalled.should.be.true();

                        res.body.should.deepEqual({});
                        res.text.should.equal(`Invalid artist id specified: ${model.artist_id}`);
                        done();
                    });
            });

            it('should reject on extraneous fields', function (done) {
                testData.request
                    .post('/song')
                    .send({ name: testData.newName, gender: 'male', age: '156' })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;
                        db.model('song').insert.notCalled.should.be.true();
                        res.body.should.deepEqual({});
                        res.text.should.equal('Unexpected data found: \'{"gender":"male","age":"156"}\'');
                        done();
                    });
            });
        });
    });

    describe('put', function () {
        describe('model', function () {
            it('should update the song name', function (done) {
                testData.request
                    .put(`/song/${testData.model.id}`)
                    .send({ name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /json/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').update.args[0].should.deepEqual([
                            { name: testData.newName },
                            { debug: false } // This should be the normal state.
                        ]);

                        res.body.should.deepEqual({
                            ...testData.model,
                            name: testData.newName,
                            url: `http://127.0.0.1/song/${testData.model.id}`,
                            artist: testData.artist
                        });
                        done();
                    });
            });

            it('should update the artist id', function (done) {
                let newArtistId = testData.model.artist_id + 1;
                const artistIdIdx = testDb.tableDefs.artist.ids.indexOf(newArtistId);

                if (artistIdIdx === -1) {
                    newArtistId = testDb.tableDefs.artist.ids[0];
                }

                const Artist = db.model('artist');

                Artist.fetchById(newArtistId)
                    .then(artistModel => {
                        const artist = {
                            ...artistModel,
                            url: `http://127.0.0.1/artist/${newArtistId}`
                        };

                        testData.request
                            .put(`/song/${testData.model.id}`)
                            .send({ artist_id: newArtistId })
                            .set('Accept', 'application/json')
                            .set('Authorization', testData.authorizationHeader)
                            .expect(200)
                            .expect('Content-Type', /json/)
                            .end(function (err, res) {
                                if (err) throw err;

                                db.model('song').update.args[0].should.deepEqual([
                                    { artist_id: newArtistId },
                                    { debug: false } // This should be the normal state.
                                ]);

                                res.body.should.deepEqual({
                                    ...testData.model,
                                    artist_id: newArtistId,
                                    url: `http://127.0.0.1/song/${testData.model.id}`,
                                    artist
                                });
                                done();
                            });
                    });
            });

            it('should reject on a duplicate name/artist_id', function (done) {
                testData.request
                    .put(`/song/${testData.model.id}`)
                    .send({
                        name: testData.duplicate.name,
                        artist_id: testData.duplicate.artist_id
                    })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').update.args[0].should.deepEqual([
                            { name: testData.duplicate.name, artist_id: testData.duplicate.artist_id },
                            { debug: false } // This should be the normal state.
                        ]);

                        res.body.should.deepEqual({});
                        res.text.should.match(/^Invalid request SQL UNIQUE CONSTRAINT \(\{.*\}\)$/);
                        done();
                    });
            });

            it('should reject on an invalid artist id', function (done) {
                const newArtistId = Math.max(...testDb.tableDefs.artist.ids) + 10;
                testData.request
                    .put(`/song/${testData.model.id}`)
                    .send({ artist_id: newArtistId })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(400)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').update.notCalled.should.be.true();

                        res.body.should.deepEqual({});
                        res.text.should.equal(`Invalid artist id specified: ${newArtistId}`);
                        done();
                    });
            });

            it('should return 404 on non-existent id', function (done) {
                testData.request
                    .put(`/song/${testData.findId}`)
                    .send({ name: testData.newName })
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;

                        db.model('song').update.args[0].should.deepEqual([
                            { name: testData.newName },
                            { debug: false } // This should be the normal state.
                        ]);

                        res.body.should.deepEqual({});
                        res.text.should.equal('Not Found');
                        done();
                    });
            });
        });
    });

    describe.skip('delete', function () {
        describe('model', function () {
            it('should delete the model from the datatbase', function (done) {
                testData.request
                    .delete(`/song/${testData.model.id}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(200)
                    .expect('Content-Type', /text\/plain/)
                    .end(function (err, res) {
                        if (err) throw err;
                        Song.query.args.should.deepEqual([
                            ['where', 'id', '=', testData.model.id]
                        ]);
                        res.body.should.deepEqual({});
                        res.text.should.equal('OK');
                        done();
                    });
            });

            it('should return 404 on non-existent id', function (done) {
                testData.request
                    .delete(`/song/${testData.findId}`)
                    .set('Accept', 'application/json')
                    .set('Authorization', testData.authorizationHeader)
                    .expect(404)
                    .expect('Content-Type', /text\/html/)
                    .end(function (err, res) {
                        if (err) throw err;
                        Song.query.args.should.deepEqual([
                            ['where', 'id', '=', testData.findId]
                        ]);
                        res.body.should.deepEqual({});
                        res.text.should.equal('Not Found');
                        done();
                    });
            });
        });
    });
});

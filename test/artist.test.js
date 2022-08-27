const request = require('supertest');
const sinon = require('sinon');
const should = require('should');
const faker = require('@faker-js/faker').faker;

// TODO: This connection boilerplate doesn't really belong here.
const db = require('../lib/db')({
  connection: ':memory:',
  pool: {
    min: 1,
    max: 1,
    disposeTimeout: 360000 * 1000,
    idleTimeoutMillis: 360000 * 1000,
  },
});
const testDb = require('./lib/db');

after(function () {
  db.knex.destroy((err) => {
    console.log(err);
  })
});

describe('artist', function () {
  const tableName = 'artist';
  const Artist = db.model(tableName);

  const testData = {};

  beforeEach(function (done) {
    testDb.buildSchema()
      .then(() => {
        return testDb.loadTable(tableName, 25, (args) => {
          const fakeName = faker.unique(faker.name.findName); // Deprecated and replaced by 'fullName' in a later faker release.
          return { name: fakeName, ...args };
        });
      })
      .then((artists) => {
        testDb.stubPermissions();
        testDb.stubArtist();
      })
      .then(() => {
        testData.newName = faker.unique(faker.name.findName); // Deprecated and replaced by 'fullName' in a later faker release.
        testData.findName = faker.unique(faker.name.findName); // Deprecated and replaced by 'fullName' in a later faker release.
        return testDb.getTestModel(tableName, 2);
      })
      .then((testModel) => {
        testData.model = testModel;
        return testDb.getNextId(tableName);
      })
      .then((newId) => {
        testData.newId = newId;
        testData.findId = newId + 100;
        return testDb.getTestModel(tableName, 4);
      })
      .then((dupModel) => {
        const app = require('../app.js');
        testData.duplicate = dupModel;
        testData.request = request(app)
        done()
      })
      .catch((err) => {
        done(err);
      });
  });

  describe('get', function () {
    describe('collection', function () {
      function bodyExpect(queryExpect) {
        const query = testDb.parseQueryArgs(queryExpect);
        const newOffset = query.offset + query.limit;
        const queryBuilder = db.knex(tableName);
        queryExpect.forEach((arg) => {
          if (arg.length > 0) {
            queryBuilder[arg[0]](arg.slice(1));
          }
        });

        return queryBuilder.select()
          .then((result) => {
            let body = { data: result };

            if (body.data.length >= query.limit) {
              body.nextPage = `http://127.0.0.1:3000/artist/?offset=${newOffset}&limit=${query.limit}`;
            }

            return Promise.resolve(body);
          });
      };

      it('should return all the rows in page one', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '0'],
          ['limit', '10'],
          [],
        ];

        testData.request
          .get('/artist')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            testDb.artistCollection.query.args.should.deepEqual(queryExpect);
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation);
                done();
              });
          });
      });

      it('should return the next page of rows', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '10'],
          ['limit', '10'],
          [],
        ];

        testData.request
          .get('/artist?offset=10&limit=10')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            testDb.artistCollection.query.args.should.deepEqual(queryExpect);
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation);
                done();
              });
          });
      });

      it('should return partial page', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '20'],
          ['limit', '10'],
          [],
        ];

        testData.request
          .get('/artist?offset=20&limit=10')
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            testDb.artistCollection.query.args.should.deepEqual(queryExpect);
            bodyExpect(queryExpect)
              .then(function (expectation) {
                res.body.should.deepEqual(expectation);
                done();
              });
          });
      });

      it('should return a 404', function (done) {
        const queryExpect = [
          ['orderBy', 'name'],
          ['offset', '30'],
          ['limit', '10'],
          [],
        ];

        testData.request
          .get('/artist?offset=30&limit=10')
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            testDb.artistCollection.query.args.should.deepEqual(queryExpect);
            res.body.should.deepEqual({});
            res.text.should.equal('Not Found');
            done();
          });
      });
    });

    describe('model', function () {
      it('should return the specified row by name', function (done) {
        testData.request
          .get(`/artist/${testData.model.name}`)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'name', '=', testData.model.name],
            ]);
            res.body.should.deepEqual(testData.model);
            done();
          });
      });

      it('should return 404 if name does not exist', function (done) {
        testData.request
          .get(`/artist/${testData.findName}`)
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'name', '=', testData.findName],
            ]);
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

        testData.request
          .post(`/artist`)
          .send({ name: testData.newName })
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([]);
            res.body.should.deepEqual({
              id: testData.newId,
              name: testData.newName,
            });
            done();
          });
      });

      it('should override the specified id', function (done) {
        testData.request
          .post(`/artist`)
          .send({ id: 1, name: testData.newName })
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([]);
            res.body.should.deepEqual({
              id: testData.newId,
              name: testData.newName,
            });
            done();
          });
      });

      it('should reject on missing name', function (done) {
        testData.request
          .post(`/artist`)
          .send({})
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([]);
            res.body.should.deepEqual({});
            res.text.should.equal('Name must be specified');
            done();
          });
      });

      it('should reject on duplicate name', function (done) {
        testData.request
          .post(`/artist`)
          .send({ name: testData.duplicate.name })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([]);
            res.body.should.deepEqual({});
            res.text.should.equal(`artist: duplicate name '${testData.duplicate.name}'`);
            done();
          });
      });

      it('should reject on extraneous fields', function (done) {
        testData.request
          .post(`/artist`)
          .send({ name: testData.newName, gender: 'male', age: '156' })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([]);
            res.body.should.deepEqual({});
            res.text.should.equal(`Unexpected data found: '{"gender":"male","age":"156"}'`);
            done();
          });
      });
    });
  });

  describe('put', function () {
    describe('model', function () {
      it('should update the artist name', function (done) {
        testData.request
          .put(`/artist/${testData.model.id}`)
          .send({ name: testData.newName })
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()],
            ]);
            res.body.should.deepEqual({ id: testData.model.id, name: testData.newName });
            done();
          });
      });

      it('should reject on a duplicate name', function (done) {
        testData.request
          .put(`/artist/${testData.model.id}`)
          .send({ name: testData.duplicate.name })
          .set('Accept', 'application/json')
          .expect(400)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()],
            ]);
            res.body.should.deepEqual({});
            res.text.should.equal(`artist: duplicate name '${testData.duplicate.name}'`);
            done();
          });
      });

      it('should return 404 on non-existent id', function (done) {
        testData.request
          .put(`/artist/${testData.findId}`)
          .send({ name: testData.newName })
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'id', '=', testData.findId.toString()],
            ]);
            res.body.should.deepEqual({});
            res.text.should.equal('Not Found');
            done();
          });
      });
    });
  });

  describe('delete', function () {
    describe('model', function () {
      it('should delete the model from the datatbase', function (done) {
        testData.request
          .delete(`/artist/${testData.model.id}`)
          .set('Accept', 'application/json')
          .expect(200)
          .expect('Content-Type', /text\/plain/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'id', '=', testData.model.id.toString()],
            ]);
            res.body.should.deepEqual({});
            res.text.should.equal('OK');
            done();
          });
      });

      it('should return 404 on non-existent id', function (done) {
        testData.request
          .delete(`/artist/${testData.findId}`)
          .set('Accept', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function (err, res) {
            if (err) throw err;
            Artist.query.args.should.deepEqual([
              ['where', 'id', '=', testData.findId.toString()],
            ]);
            res.body.should.deepEqual({});
            res.text.should.equal('Not Found');
            done();
          });
      });
    });
  });
})
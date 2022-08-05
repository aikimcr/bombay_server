const request = require('supertest');
const sinon = require('sinon');
const should = require('should');
const faker = require('@faker-js/faker').faker;

const db = require('../lib/db')();
const permissions = require('../lib/permissions');
const Song = db.model('song');

beforeEach(function() {
  db_stubs.stubPermissions();
  db_stubs.stubArtist();
  db_stubs.stubSong();
});

describe('get', function() {
  describe('collection', function() {
    function bodyExpect() {
      const query = parseQueryArgs(songCollection.query.args);
      const newOffset = query.offset + query.limit;

      const newData = songCollection
        .sortBy(query.orderBy)
        .slice(query.offset, newOffset)
        .map(model => {
          return model.toJSON();
        });

      let body = {data: newData};

      if (body.data.length >= query.limit) {
        body.nextPage = `http://127.0.0.1:3000/song/?offset=${newOffset}&limit=${query.limit}`;
      }

      return body;
    };

    it('should return all the rows in page one', function(done) {
      const app = require('../app.js');
      request(app)
        .get('/song')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          songCollection.query.args.should.deepEqual([
            ['orderBy', 'name'],
            ['offset', '0'],
            ['limit', '10'],
          ]);
          res.body.should.deepEqual(bodyExpect());
          done();
        });
    });

    it('should return the next page of rows', function(done) {
      const app = require('../app.js');

      request(app)
        .get('/song?offset=10&limit=10')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          songCollection.query.args.should.deepEqual([
            ['orderBy', 'name'],
            ['offset', '10'],
            ['limit', '10'],
          ])
          res.body.should.deepEqual(bodyExpect());
          done();
        });
    });

    it('should return partial page', function(done) {
      const app = require('../app.js');

      request(app)
        .get('/song?offset=20&limit=10')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          songCollection.query.args.should.deepEqual([
            ['orderBy', 'name'],
            ['offset', '20'],
            ['limit', '10'],
          ])
          res.body.should.deepEqual(bodyExpect());
          done();
        });
    });

    it('should return a 404', function(done) {
      const app = require('../app.js');

      request(app)
        .get('/song?offset=30&limit=10')
        .set('Accept', 'application/json')
        .expect(404)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          songCollection.query.args.should.deepEqual([
            ['orderBy', 'name'],
            ['offset', '30'],
            ['limit', '10'],
          ])
          res.body.should.deepEqual({});
          res.text.should.equal('Not Found');
          done();
        });
    });
  });

  describe('model', function() {
    it('should return the specified row by name', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const testModel = collection.at(2);

      request(app)
        .get(`/song/${testModel.get('name')}`)
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'name', '=', testModel.get('name')],
          ]);
          res.body.should.deepEqual(testModel.toJSON());
          done();
        });
    });

    it('should return 404 if name does not exist', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const findName = `${faker.name.firstName()} ${faker.name.lastName()} ${faker.random.word()}`;

      request(app)
        .get(`/song/${findName}`)
        .set('Accept', 'application/json')
        .expect(404)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'name', '=', findName],
          ]);
          res.body.should.deepEqual({});
          res.text.should.equal('Not Found');
          done();
        });
    });
  });
});

describe('post', function() {
  describe('model', function() {
    it('should add a new record with a new id', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const newId = collection.length + 1;
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .post(`/song`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([]);
          res.body.should.deepEqual({
            id: newId,
            name: newName,
          });
          done();
        });
    });

    it('should override the specified id', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const newId = collection.length + 1;
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .post(`/song`)
        .send({id: 1, name: newName})
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([]);
          res.body.should.deepEqual({
            id: newId,
            name: newName,
          });
          done();
        });
    });

    it('should reject on missing name', function(done) {
      const app = require('../app.js');
      const collection = song.collection();

      request(app)
        .post(`/song`)
        .send({})
        .set('Accept', 'application/json')
        .expect(400)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([]);
          res.body.should.deepEqual({});
          res.text.should.equal('Name must be specified');
          done();
        });
    });

    it('should reject on duplicate name', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const newName = collection.at(5).get('name');

      request(app)
        .post(`/song`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(400)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([]);
          res.body.should.deepEqual({});
          res.text.should.equal(`song: duplicate name '${newName}'`);
          done();
        });
    });

    it('should reject on extraneous fields', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .post(`/song`)
        .send({name: newName, gender: 'male', age: '156'})
        .set('Accept', 'application/json')
        .expect(400)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([]);
          res.body.should.deepEqual({});
          res.text.should.equal(`Unexpected data found: '{"gender":"male","age":"156"}'`);
          done();
        });
    });
  });
});

describe('put', function() {
  describe('model', function() {
    it('should update the song name', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const testModel = collection.at(2);
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .put(`/song/${testModel.get('id')}`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'id', '=', testModel.get('id').toString()],
          ]);
          res.body.should.deepEqual({id: testModel.get('id'), name: newName});
          done();
        });
    });

    it('should reject on a duplicate name', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const testModel = collection.at(2);
      const newName = collection.at(4).get('name');

      request(app)
        .put(`/song/${testModel.get('id')}`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(400)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'id', '=', testModel.get('id').toString()],
          ]);
          res.body.should.deepEqual({});
          res.text.should.equal(`song: duplicate name '${newName}'`);
          done();
        });
    });

    it('should return 404 on non-existent id', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const findId = collection.length + 1;
      const newName = collection.at(4).get('name');

      request(app)
        .put(`/song/${findId}`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(404)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'id', '=', findId.toString()],
          ]);
          res.body.should.deepEqual({});
          res.text.should.equal('Not Found');
          done();
        });
    });
  });
});

describe('delete', function() {
  describe('model', function() {
    it('should delete the model from the datatbase', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const testModel = collection.at(2);

      request(app)
        .delete(`/song/${testModel.get('id')}`)
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /text\/plain/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'id', '=', testModel.get('id').toString()],
          ]);
          res.body.should.deepEqual({});
          res.text.should.equal('OK');
          done();
        });
    });

    it('should return 404 on non-existent id', function(done) {
      const app = require('../app.js');
      const collection = song.collection();
      const findId = collection.length + 1;

      request(app)
        .delete(`/song/${findId}`)
        .set('Accept', 'application/json')
        .expect(404)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          if (err) throw err;
          song.query.args.should.deepEqual([
            ['where', 'id', '=', findId.toString()],
          ]);
          res.body.should.deepEqual({});
          res.text.should.equal('Not Found');
          done();
        });
    });
  });
});

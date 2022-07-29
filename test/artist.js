const request = require('supertest');
const sinon = require('sinon');
const should = require('should');
const faker = require('@faker-js/faker').faker;

const db = require('../lib/db')();

let artistCollection;

function parseQueryArgs(args) {
  const result = {
    offset: 0,
    limit: 10,
    orderBy: 'name',
    artistQueryIndex: -1,
  };

  args.forEach(queryArgs => {
    switch(queryArgs[0]) {
      case 'limit': result.limit = Number(queryArgs[1]); break;
      case 'offset': result.offset = Number(queryArgs[1]); break;
      case 'orderBy': result.orderBy = queryArgs[1]; break;
      case 'where':
        switch(queryArgs[1]) {
          case 'name': result.artistQueryIndex = artistCollection.models.findIndex(model => {
            return model.get('name') === queryArgs[3];
          });
          break;

          case 'id': result.artistQueryIndex = artistCollection.models.findIndex(model => {
            return model.get('id') === Number(queryArgs[3]);
          });
          break;
        };
        break;
    }
  });

  return result;
}

beforeEach(function() {
  sinon.stub(db.artist, 'forge').callsFake(function() {
    const model = new this();

    sinon.stub(model, 'fetch').callsFake(async function() {
      const query = parseQueryArgs(db.artist.query.args);
      return artistCollection.at(query.artistQueryIndex);
    });

    sinon.stub(model, 'save').callsFake(async function(attributes, options) {
      model.set(attributes);
      model.set({id: artistCollection.length + 1});
      return model;
    });

    return model;
  });

  sinon.stub(db.artist, 'collection').callsFake(function() {
    const collection = new db.bookshelf.Collection();

    const modelsPromise = new Promise((resolve, reject) => {
      const models = [];

      for(let i=0; i<50; i++) {
        const model = db.artist.forge();
        model.set({
          id: i+1,
          name: `${faker.name.firstName()} ${faker.name.lastName()}`,
        });
        models.push(model);
      }

      const tmpCollection = new db.bookshelf.Collection(models);
      collection.reset(tmpCollection.slice(0, 25));
      resolve(collection);
    });

    sinon.stub(collection, 'fetch').callsFake(async function() {
      await modelsPromise;
      const query = parseQueryArgs(this.query.args);
      const collectionModels = this.sortBy(query.orderBy).slice(query.offset, query.offset + query.limit);

      const collection = new db.bookshelf.Collection(collectionModels);

      if (collection.length < collectionModels.length) {
        throw new Error(`Collection length does not match models: ${collection.length}(C) !== ${collectionModels.length}(M).`);
      }

      return collection;
    });

    sinon.stub(collection, 'query').returns(collection);

    artistCollection = collection;
    return collection;
  })

  sinon.stub(db.artist, 'query').returns(db.artist.forge());
});

describe('get', function() {
  describe('collection', function() {
    function bodyExpect() {
      const query = parseQueryArgs(artistCollection.query.args);
      const newOffset = query.offset + query.limit;

      const newData = artistCollection
        .sortBy(query.orderBy)
        .slice(query.offset, newOffset)
        .map(model => {
          return model.toJSON();
        });

      let body = {data: newData};

      if (body.data.length >= query.limit) {
        body.nextPage = `http://127.0.0.1:3000/artist/?offset=${newOffset}&limit=${query.limit}`;
      }

      return body;
    };

    it('should return all the rows in page one', function(done) {
      const app = require('../app.js');
      request(app)
        .get('/artist')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          artistCollection.query.args.should.deepEqual([
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
        .get('/artist?offset=10&limit=10')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          artistCollection.query.args.should.deepEqual([
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
        .get('/artist?offset=20&limit=10')
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          artistCollection.query.args.should.deepEqual([
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
        .get('/artist?offset=30&limit=10')
        .set('Accept', 'application/json')
        .expect(404)
        .expect('Content-Type', /text\/plain/)
        .end(function(err, res) {
          if (err) throw err;
          artistCollection.query.args.should.deepEqual([
            ['orderBy', 'name'],
            ['offset', '30'],
            ['limit', '10'],
          ])
          res.body.should.deepEqual({});
          done();
        });
    });
  });

  describe('model', function() {
    it('should return the specified row by name', function(done) {
      const app = require('../app.js');
      const collection = db.artist.collection();
      const testModel = collection.at(2);

      request(app)
        .get(`/artist/${testModel.get('name')}`)
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          db.artist.query.args.should.deepEqual([
            ['where', 'name', '=', testModel.get('name')],
          ]);
          res.body.should.deepEqual(testModel.toJSON());
          done();
        });
    });
  });
});

describe('post', function() {
  describe('model', function() {
    it('should add a new record with a new id', function(done) {
      const app = require('../app.js');
      const collection = db.artist.collection();
      const newId = collection.length + 1;
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .post(`/artist`)
        .send({name: newName})
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          db.artist.query.args.should.deepEqual([]);
          res.body.should.deepEqual({
            id: newId,
            name: newName,
          });
          done();
        });
    });

    it('should override the specified id', function(done) {
      const app = require('../app.js');
      const collection = db.artist.collection();
      const newId = collection.length + 1;
      const newName = `${faker.name.firstName()} ${faker.name.lastName()}`;

      request(app)
        .post(`/artist`)
        .send({id: 1, name: newName})
        .set('Accept', 'application/json')
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res) {
          if (err) throw err;
          db.artist.query.args.should.deepEqual([]);
          res.body.should.deepEqual({
            id: newId,
            name: newName,
          });
          done();
        });
    });

    it('should reject on missing name', function(done) {
      const app = require('../app.js');
      const collection = db.artist.collection();
      const newId = collection.length + 1;

      request(app)
        .post(`/artist`)
        .send({})
        .set('Accept', 'application/json')
        .expect(400)
        .expect('Content-Type', /text\/html/)
        .end(function(err, res) {
          debugger;
          if (err) throw err;
          db.artist.query.args.should.deepEqual([]);
          res.body.should.deepEqual({});
          res.text.should.equal('Name must be specified');
          done();
        });
    });
  });
});

describe('put', function() {

});

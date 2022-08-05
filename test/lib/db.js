const { readFile } = require('fs').promises;
const { Readable } = require('stream');
const readline = require('readline');
const path = require('path');

const sinon = require('sinon');
const faker = require('@faker-js/faker').faker;

const db = require('../../lib/db')(':memory:');
const permissions = require('../../lib/permissions');

async function buildSchema() {
  const schemaFile = path.normalize('./sql/schema.sql');
  const schemaBuffer = await readFile(schemaFile);

  // TODO: This fails hard for creating triggers.  Triggers have
  //       a BEGIN/END thing which may contain ';'
  let schemaText = schemaBuffer.toString();
  schemaText = schemaText.replace(/\/\*[\w\W]*\*\//g, '');
  schemaText = schemaText.replace(/\n/g, ' ');
  schemaText = schemaText.replace(/\s+/g, ' ');
  schemaText = schemaText.split(/;/);

  for (const schemaLine of schemaText) {
    const line = schemaLine.replace(/^\s+/, '').replace(/\s+$/, '');

    if (line.length > 0) {
      await db.knex.schema.raw(line);
    }
  }

}
exports.buildSchema = buildSchema;

function parseQueryArgs(args) {
  const result = {
    offset: 0,
    limit: 10,
    orderBy: 'name',
  };

  args.forEach(queryArgs => {

    if (queryArgs.length > 0) {
      switch(queryArgs[0]) {
        case 'limit': result.limit = Number(queryArgs[1]); break;
        case 'offset': result.offset = Number(queryArgs[1]); break;
        case 'orderBy': result.orderBy = queryArgs[1]; break;
        default:
          if (result.queryArgs[0]) {
            result.queryArgs[0].push(queryArgs.slice(1));
          } else {
            result.queryArgs[0] = [queryArgs.slice(1)];
          }
          break;
      }
    }
  });

  return result;
}
exports.parseQueryArgs = parseQueryArgs;

function getTestModel(tableName, offset = 2) {
  return db.knex(tableName)
    .offset(offset)
    .limit(1)
    .select()
    .then((models) => {
      if (Array.isArray(models)) {
        return Promise.resolve(models[0]);
      } else {
        return Promise.resolve(models);
      }
    });
}
exports.getTestModel = getTestModel;

function getNextId(tableName) {
  return db.knex(tableName)
    .max('id')
    .select()
    .then((models) => {
      const model = Array.isArray(models) ? models[0]: models;
      return Promise.resolve(model['max(`id`)'] + 1);
    });
}
exports.getNextId = getNextId;

function loadTable(tableName, capacity, modelMaker) {
  const table = db.model(tableName);
  const tablePromises = [];

  while(tablePromises.length < capacity) {
    const modelDef = modelMaker({id: tablePromises.length + 1});
    tablePromises.push(table.forge(modelDef).save(null, {method: 'insert'}));
  }

  return Promise.all(tablePromises);
}
exports.loadTable = loadTable;

exports.stubPermissions = () => {
  sinon.stub(permissions, 'authorize').callsFake(function(req, res, next) {
    return (req, res, next) => {
      next();
    }
  });
};

function stubModel(tableName, unique = []) {
  const table = db.model(tableName);
  const collectionName = `${tableName}Collection`;

  sinon.stub(table, 'forge').callsFake(function() {
    const model = new this();

    sinon.spy(model, 'fetch');
    // sinon.stub(model, 'fetch').callsFake(function() {
    //   return new Promise((resolve, reject) => {
    //     const query = parseQueryArgs(table.query.args, exports[collectionName]);
    //     const modelResult = exports[collectionName].at(query.tableQueryIndex);
    //
    //     if (modelResult) {
    //       resolve(modelResult);
    //     } else {
    //       reject(new Error("No rows found"));
    //     }
    //   })
    // });

    sinon.spy(model, 'save');
    // sinon.stub(model, 'save').callsFake(function(attributes, options) {
    //   return new Promise((resolve, reject) => {
    //     const duplicate = exports[collectionName].find(model => {
    //       return unique.reduce((memo, column) => {
    //         return memo && model.get(column) === attributes[column];
    //       }, true);
    //     });
    //
    //     if (duplicate) {
    //       reject({
    //         code: 'SQLITE_CONSTRAINT',
    //         message: `SQLITE_CONSTRAINT: duplicate: artist.name`,
    //       });
    //     } else {
    //       if (options.patch) {
    //         delete attributes.id;
    //       } else {
    //         attributes.id = exports[collectionName].length + 1;
    //       }
    //
    //       model.set(attributes);
    //       resolve(model);
    //     }
    //   });
    // });

    sinon.spy(model, 'destroy');
    // sinon.stub(model, 'destroy').callsFake(function(options) {
    //   return new Promise((resolve, reject) => {
    //     const query = parseQueryArgs(table.query.args, exports[collectionName]);
    //     const modelResult = exports[collectionName].at(query.tableQueryIndex);
    //
    //     if (modelResult) {
    //       exports[collectionName].remove(modelResult);
    //       resolve({});
    //     } else {
    //       reject(new Error("No rows found"));
    //     }
    //   })
    // })

    return model;
  });

  sinon.stub(table, 'collection').callsFake(function() {
    const collection = new db.Collection();
    collection.model = table;

    // const modelsPromise = new Promise((resolve, reject) => {
    //   const models = [];
    //
    //   for(let i=0; i<50; i++) {
    //     const model = table.forge();
    //     model.set({
    //       id: i+1,
    //       name: `${faker.name.firstName()} ${faker.name.lastName()}`,
    //     });
    //     models.push(model);
    //   }
    //
    //   const tmpCollection = new db.Collection(models);
    //   collection.reset(tmpCollection.slice(0, 25));
    //   resolve(collection);
    // });

    sinon.spy(collection, 'fetch');
    // sinon.stub(collection, 'fetch').callsFake(async function() {
    //   await modelsPromise;
    //   const query = parseQueryArgs(this.query.args);
    //   const collectionModels = this.sortBy(query.orderBy).slice(query.offset, query.offset + query.limit);
    //
    //   const collection = new db.Collection(collectionModels);
    //
    //   if (collection.length < collectionModels.length) {
    //     throw new Error(`Collection length does not match models: ${collection.length}(C) !== ${collectionModels.length}(M).`);
    //   }
    //
    //   return collection;
    // });

    sinon.spy(collection, 'query');
    // sinon.stub(collection, 'query').returns(collection);

    exports[collectionName] = collection;
    return collection;
  })

  sinon.spy(table, 'query');
  // sinon.stub(table, 'query').returns(table.forge());
};

exports.stubArtist = stubModel.bind(undefined, 'artist', ['name']);
exports.stubSong = stubModel.bind(undefined, 'song', ['name', 'artist_id']);

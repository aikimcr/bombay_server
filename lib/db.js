let bookshelf;

function defineTable(tableName) {
  return bookshelf.model(tableName, {
    tableName: tableName,
  }, {
    // Some utility methods that are needed on most tables
    fetchById(id) {
      return this.query('where', 'id', '=', id).fetch();
    },

    fetchFirstByName(name) {
      return this.query('where', 'name', '=', name).fetch();
    }
  });
}

function open(args) {
  if (bookshelf) {
    return bookshelf;
  }

  args = {filename: './db/bombay.db', debug: true};

  const knex = require('knex')({
    debug: args.debug,
    client: 'sqlite3',
    connection: {
      filename: args.filename,
    }
  });

  bookshelf = require('bookshelf')(knex);

  const user = defineTable('user');
  const artist = defineTable('artist');

  return bookshelf;
}

module.exports = open;

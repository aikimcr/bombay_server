let db;

function open(args) {
  if (db) {
    return db;
  }

  args = {filename: './db/bombay.db', debug: true};

  const knex = require('knex')({
    debug: args.debug,
    client: 'sqlite3',
    connection: {
      filename: args.filename,
    }
  });

  const bookshelf = require('bookshelf')(knex);
  const artist = bookshelf.model('artist', {
    tableName: 'artist',
  }, {
    fetchById(id) {
      return this.query('where', 'id', '=', id).fetch();
    }
  });

  db = {
    bookshelf: bookshelf,
    artist: artist,
  }

  return db;
}

module.exports = open;

let db;

class DBClass {
    #knex;
    #models = {};

    constructor (knex) {
        this.#knex = knex;
    }

    get knex () { return this.#knex; }

    setModel (model) {
        this.#models[model.tableName] = model;
    }

    model (tableName) {
        return this.#models[tableName];
    }
}

class DBModel {
    #tableName = '';
    #fieldList = [];

    constructor (tableName, fieldList, functions) {
        this.#tableName = tableName;
        this.#fieldList = fieldList;

        for (const fname in functions) {
            this[fname] = functions[fname].bind(this);
        }
    }

    get tableName () { return this.#tableName; }
    get fieldList () { return [...this.#fieldList]; }

    select (columns, options = { debug: false }) {
        return db.knex.select(columns).from(this.#tableName).debug(options.debug);
    }

    insert (data, options = { debug: false }) {
        return db.knex.insert(data, this.fieldList)
            .into(this.tableName)
            .debug(options.debug)
            .then(values => {
                if (Array.isArray(data)) {
                    return values;
                } else {
                    return values[0];
                }
            });
    }

    update (data, options = { debug: false }) {
        return db.knex(this.tableName).update(data, this.fieldList).debug(options.debug);
    }

    del (options = { debug: false }) {
        return db.knex(this.tableName).delete().debug(options.debug);
    }

    count (options = { debug: false }) {
        return db.knex(this.tableName).count('id', { as: 'rows' }).debug(options.debug);
    }

    fetchById (id, options = { debug: false }) {
        return db.knex.select()
            .from(this.tableName)
            .debug(options.debug)
            .where('id', '=', id)
            .then(result => result.length > 0 ? result[0] : undefined);
    }
}

function defineTable (tableName, fieldList) {
    const newModel = new DBModel(tableName, fieldList, {
        fetchFirstByName: function (name, options = { debug: false }) {
            return db.knex.select()
                .from(this.tableName)
                .debug(options.debug)
                .where('name', '=', name)
                .then(result => result.length > 0 ? result[0] : undefined);
        }
    });

    db.setModel(newModel);
}

function defineSessionTable (fieldList) {
    const newModel = new DBModel('session', fieldList, {
        fetchByToken: function (token) {
            return db.knex.select()
                .from(this.tableName)
                .where('session_token', '=', token)
                .then(result => result[0]);
        },

        generateToken: function () {
            return parseInt(Math.random() * parseInt('FFFFFFFF', 16), 10)
                .toString(16)
                .toUpperCase();
        }
    });

    db.setModel(newModel);
}

function open (args) {
    if (db) {
        return db;
    }

    args = {
        client: 'sqlite3',
        connection: {
            filename: './db/bombay.db'
        },
        debug: false,
        ...args
    };

    const knex = require('knex')({
        debug: args.debug,
        client: 'sqlite3',
        connection: args.connection
    });

    db = new DBClass(knex);

    defineTable('user', ['id', 'name', 'full_name', 'password', 'email', 'system_admin', 'session_expires']);
    defineSessionTable(['id', 'session_token', 'session_start', 'user_id']);
    defineTable('artist', ['id', 'name']);
    defineTable('song', ['id', 'name', 'artist_id', 'key_signature', 'tempo', 'lyrics']);

    return db;
}

module.exports = open;

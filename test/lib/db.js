const request = require('supertest')
const { readFile } = require('fs').promises
const path = require('path')

const sinon = require('sinon')
const faker = require('@faker-js/faker').faker

const db = require('../../lib/db')()
const permissions = require('../../lib/permissions')
const jwt = require('jsonwebtoken')

async function buildSchema () {
    const schemaFile = path.normalize('./sql/schema.sql')
    const schemaBuffer = await readFile(schemaFile)

    // TODO: This fails hard for creating triggers.  Triggers have
    //       a BEGIN/END thing which may contain ';'
    let schemaText = schemaBuffer.toString()
    schemaText = schemaText.replace(/\/\*[\w\W]*\*\//g, '')
    schemaText = schemaText.replace(/\n/g, ' ')
    schemaText = schemaText.replace(/\s+/g, ' ')
    schemaText = schemaText.split(/;/)

    for (const schemaLine of schemaText) {
        const line = schemaLine.replace(/^\s+/, '').replace(/\s+$/, '')

        if (line.length > 0) {
            await db.knex.schema.raw(line)
        }
    }
}
exports.buildSchema = buildSchema

function parseQueryArgs (args) {
    const result = {
        offset: 0,
        limit: 10,
        orderBy: 'name'
    }

    args.forEach(queryArgs => {
        if (queryArgs.length > 0) {
            switch (queryArgs[0]) {
            case 'limit': result.limit = Number(queryArgs[1]); break
            case 'offset': result.offset = Number(queryArgs[1]); break
            case 'orderBy': result.orderBy = queryArgs[1]; break
            default:
                if (result.queryArgs[0]) {
                    result.queryArgs[0].push(queryArgs.slice(1))
                } else {
                    result.queryArgs[0] = [queryArgs.slice(1)]
                }
                break
            }
        }
    })

    return result
}
exports.parseQueryArgs = parseQueryArgs

function getTestModel (tableName, offset = 2) {
    return db.knex(tableName)
        .offset(offset)
        .limit(1)
        .select()
        .then((models) => {
            if (Array.isArray(models)) {
                return Promise.resolve(models[0])
            } else {
                return Promise.resolve(models)
            }
        })
}
exports.getTestModel = getTestModel

function getNextId (tableName) {
    return db.knex(tableName)
        .max('id')
        .select()
        .then((models) => {
            const model = Array.isArray(models) ? models[0] : models
            return Promise.resolve(model['max(`id`)'] + 1)
        })
}
exports.getNextId = getNextId

function loadTable (tableName, capacity, modelMaker) {
    const table = db.model(tableName)
    const tablePromises = []

    while (tablePromises.length < capacity) {
        const modelDef = modelMaker({ id: tablePromises.length + 1 })
        tablePromises.push(table.forge().save(modelDef, { method: 'insert' }))

        tablePromises[tablePromises.length - 1].catch((err) => {
            console.log('--------------> ', err.code, ' <-------------')
            console.log(tableName)
            console.log(modelDef)
            console.log(err)
        })
    }

    return Promise.all(tablePromises)
}
exports.loadTable = loadTable

exports.stubPermissions = () => {
    sinon.stub(permissions, 'authorize').callsFake(function (req, res, next) {
        return (req, res, next) => {
            next()
        }
    })
}

function stubModel (tableName, unique = []) {
    const table = db.model(tableName)
    const collectionName = `${tableName}Collection`

    sinon.stub(table, 'forge').callsFake(function () {
        const model = new this()

        sinon.spy(model, 'fetch')
        sinon.spy(model, 'save')
        sinon.spy(model, 'destroy')

        return model
    })

    sinon.stub(table, 'collection').callsFake(function () {
        const collection = new db.Collection()
        collection.model = table

        sinon.spy(collection, 'fetch')
        sinon.spy(collection, 'query')

        exports[collectionName] = collection
        return collection
    })

    sinon.spy(table, 'query')
};

exports.stubUser = stubModel.bind(undefined, 'user', ['name', 'full_name', 'password', 'email', 'system_admin', 'session_expires'])
exports.stubSession = stubModel.bind(undefined, 'session', ['session_token', 'session_start', 'user_id'])
exports.stubArtist = stubModel.bind(undefined, 'artist', ['name'])
exports.stubSong = stubModel.bind(undefined, 'song', ['name', 'artist_id'])

// Create an iterator that circles through the ids as many time as necessary.
const idIterators = {}
const idIterator = (tableName) => {
    if (idIterators[tableName]) {
        return idIterators[tableName]
    } else {
        const originalList = tableDefs[tableName].ids
        const ids = [...originalList]

        idIterators[tableName] = () => {
            const result = ids.shift()
            ids.push(result)
            return result
        }

        return idIterators[tableName]
    }
}

const tableDefs = {
    user: {
        ids: [],
        buildModel: (args) => {
            const fakeName = faker.unique(faker.name.findName)
            const fakeFull = faker.unique(faker.name.findName)

            return {
                name: fakeName,
                full_name: fakeFull,
                password: 'chunky',
                email: `${fakeName}@no_stupid_mail.gross`,
                ...args
            }
        }
    },

    session: {
        ids: [],
        buildModel: (args) => {
            const nextUserId = idIterator('user')
            const newToken = db.model('session').generateToken()
            const sessionStart = new Date().toISOString()
            const userId = nextUserId()

            return {
                session_token: newToken,
                session_start: sessionStart,
                user_id: userId,
                ...args
            }
        }
    },

    artist: {
        ids: [],
        buildModel: (args) => {
            const fakeName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
            return { name: fakeName, ...args }
        }
    },

    song: {
        ids: [],
        buildModel: (args) => {
            const nextArtistId = idIterator('artist')
            const fakeName = faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
            const fakeId = nextArtistId()

            return {
                name: fakeName,
                artist_id: fakeId,
                key_signature: '',
                tempo: '',
                lyrics: '',
                ...args
            }
        }
    }
}

tableDefs.loadModels = async (args = { artist: true }) => {
    exports.stubPermissions()

    const models = {}

    if (args.artist) {
        models.artist = await loadTable('artist', 25, tableDefs.artist.buildModel)
        tableDefs.artist.ids = models.artist.map(artist => {
            return artist.get('id')
        })
        delete idIterators.artist
        exports.stubArtist()
    }

    if (args.song && tableDefs.artist.ids.length > 0) {
        models.song = await loadTable('song', 25, tableDefs.song.buildModel)
        tableDefs.song.ids = models.song.map(song => {
            return song.get('id')
        })
        delete idIterators.song
        exports.stubSong()
    }

    models.user = await loadTable('user', 5, tableDefs.user.buildModel)
    tableDefs.user.ids = models.user.map(user => {
        return user.get('id')
    })
    exports.stubUser()

    models.session = await loadTable('session', 5, tableDefs.session.buildModel)
    tableDefs.session.ids = models.session.map(session => {
        return session.get('id')
    })
    exports.stubSession()

    return models
}

exports.tableDefs = tableDefs

exports.makeJWT = function (payload) {
    const app = require('../../app.js')
    const token = jwt.sign(payload, app.get('jwt_secret'))
    const header = `Bearer ${token}`
    return [token, header]
}

exports.getTestData = async (tableName) => {
    const testData = {
        newName: faker.unique(faker.name.findName), // Deprecated and replaced by 'fullName' in a later faker release.
        findName: faker.unique(faker.name.findName) // Deprecated and replaced by 'fullName' in a later faker release.
    }

    if (tableName) {
        testData.model = await getTestModel(tableName, 2)
        testData.newId = await getNextId(tableName)
        testData.findId = await testData.newId
        testData.duplicate = await getTestModel(tableName, 4)
    }

    const app = require('../../app.js')
    testData.app = app
    testData.request = request(app)

    testData.jwtUser = await getTestModel('user', 2)
    testData.jwtSession = await getTestModel('session', 2)
    testData.jwtPayload = {
        sub: testData.jwtSession.session_token,
        user: {
            id: testData.jwtUser.id,
            name: testData.jwtUser.name,
            admin: !!testData.jwtUser.system_admin
        }
    };

    [testData.jwtToken, testData.authorizationHeader] = exports.makeJWT(testData.jwtPayload)

    return testData
}

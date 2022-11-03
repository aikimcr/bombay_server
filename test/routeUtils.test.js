require('should')

const routeUtils = require('../lib/routeUtils')

class App {
    constructor (values = {}) {
        this.values = values
    }

    get (key) {
        return this.values[key]
    }

    set (key, value) {
        this.values[key] = value
    }
}

class Request {
    constructor (app, baseUrl, path, query) {
        this.app = app
        this.baseUrl = baseUrl
        this.path = path
        this.query = query
    }

    setBaseUrl (newUrl) {
        this.baseUrl = newUrl
    }

    setPath (newPath) {
        this.path = newPath
    }
}

class Query {
    constructor (offset, limit) {
        this.offset = offset
        this.limit = limit
    }

    setOffset (newValue) {
        this.offset = newValue
    }
}

let req

beforeEach(function () {
    req = new Request(
        new App({ baseReference: 'https://fakeserver' }),
        '/xyzzy',
        '/',
        new Query(0, 10)
    )
})

describe('route utililties', function () {
    describe('getBaseRef', function () {
        it('should return a valid base reference', function () {
            let baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver/xyzzy')

            req.setPath('/plover')
            baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver/xyzzy/plover')
        })

        it('should override baseUrl and path with options', function () {
            let baseRef = routeUtils.getBaseRef(req, { baseUrl: '/lagamorph' })
            baseRef.should.equal('https://fakeserver/lagamorph')

            baseRef = routeUtils.getBaseRef(req, { path: '/plover' })
            baseRef.should.equal('https://fakeserver/xyzzy/plover')

            // Add a slash if it isn't there
            baseRef = routeUtils.getBaseRef(req, {
                baseUrl: 'lagamorph',
                path: 'plover'
            })
            baseRef.should.equal('https://fakeserver/lagamorph/plover')
        })

        it('should omit extra or trailing slash(es) and empty string segments', function () {
            req.setBaseUrl('/foo/')
            let baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver/foo')

            req.setBaseUrl('')
            baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver')

            req.setPath('')
            baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver')

            req.setPath('fum')
            baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver/fum')

            req.setBaseUrl('rabbit')
            req.setPath('fighter')
            baseRef = routeUtils.getBaseRef(req)
            baseRef.should.equal('https://fakeserver/rabbit/fighter')

            baseRef = routeUtils.getBaseRef(req, {
                baseUrl: '/lagamorph/',
                path: 'combatant/'
            })
            baseRef.should.equal('https://fakeserver/lagamorph/combatant')
        })
    })

    describe('getModelUrl', function () {
        it('should return the url to get the model', function () {
            const model = { id: 1 }
            let modelUrl = routeUtils.getModelUrl(req, model)
            modelUrl.should.equal('https://fakeserver/xyzzy/1')

            model.id = 27
            modelUrl = routeUtils.getModelUrl(req, model)
            modelUrl.should.equal('https://fakeserver/xyzzy/27')
        })

        it('should override baseUrl and path with options', function () {
            const model = { id: 1 }
            let modelUrl = routeUtils.getModelUrl(req, model, { baseUrl: '/xx' })
            modelUrl.should.equal('https://fakeserver/xx/1')

            model.id = 27
            modelUrl = routeUtils.getModelUrl(req, model, { path: 'zoo' })
            modelUrl.should.equal('https://fakeserver/xyzzy/zoo/27')
        })

        it('should not include the path unless it is specifically in the options', function () {
            const model = { id: 1 }
            req.setPath('salvadore')
            let modelUrl = routeUtils.getModelUrl(req, model, { baseUrl: '/xx' })
            modelUrl.should.equal('https://fakeserver/xx/1')

            model.id = 27
            modelUrl = routeUtils.getModelUrl(req, model, { path: 'zoo' })
            modelUrl.should.equal('https://fakeserver/xyzzy/zoo/27')
        })
    })

    describe('getPageUrls', function () {
        it('should return the next page url', function () {
            const data = Array(10)

            const pageUrls = routeUtils.getPageUrls(req, data)
            pageUrls.should.deepEqual({
                nextPage: 'https://fakeserver/xyzzy/?offset=10&limit=10'
            })
        })

        it('should return the next and prev page urls', function () {
            const data = Array(10)
            req.query.setOffset(10)

            const pageUrls = routeUtils.getPageUrls(req, data)
            pageUrls.should.deepEqual({
                nextPage: 'https://fakeserver/xyzzy/?offset=20&limit=10',
                prevPage: 'https://fakeserver/xyzzy/?offset=0&limit=10'
            })
        })

        it('should return the prev page url', function () {
            const data = Array(5)
            req.query.setOffset(10)

            const pageUrls = routeUtils.getPageUrls(req, data)
            pageUrls.should.deepEqual({
                prevPage: 'https://fakeserver/xyzzy/?offset=0&limit=10'
            })
        })

        it('should return empty', function () {
            const data = Array(5)

            const pageUrls = routeUtils.getPageUrls(req, data)
            pageUrls.should.deepEqual({})
        })

        it('should override baseUrl and path with options', function () {
            const data = Array(10)
            req.query.setOffset(10)

            const pageUrls = routeUtils.getPageUrls(req, data, {
                baseUrl: 'telegram',
                path: 'sam'
            })
            pageUrls.should.deepEqual({
                nextPage: 'https://fakeserver/telegram/sam/?offset=20&limit=10',
                prevPage: 'https://fakeserver/telegram/sam/?offset=0&limit=10'
            })
        })
    })
})

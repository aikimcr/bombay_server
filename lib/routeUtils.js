// Utilities for managing route specs to return in routes
const createError = require('http-errors')

const db = require('../lib/db')()

// Select which option to use
function pickOption (options) {
    const result = options.find(option => {
        return option !== undefined && option !== null
    })

    if (result) {
        return result
    } else {
        return ''
    }
}

function normalizeSegment (segment) {
    if (segment.length > 0) {
        segment = segment.replace(/^\/*/, '/')

        if (segment.length > 1) {
            segment = segment.replace(/\/+$/, '')
        }
    }

    return segment
}

exports.getBaseRef = function (req, options = {}) {
    const baseReference = req.app.get('baseReference').replace(/\/+$/, '')
    const baseUrl = normalizeSegment(pickOption([options.baseUrl, req.baseUrl]))
    const path = normalizeSegment(pickOption([options.path, req.path]))
    const result = baseReference + baseUrl + path
    return result.replace(/\/+$/, '')
}

exports.getModelUrl = function (req, model, options = {}) {
    options = {
        path: '',
        ...options
    }
    return `${exports.getBaseRef(req, options)}/${model.id}`
}

exports.getPageUrls = function (req, data, options = {}) {
    const baseRef = exports.getBaseRef(req, options)
    const offset = req.query.offset || 0
    const limit = req.query.limit || 10
    const result = {}

    if (data.length >= Number(limit)) {
        const newOffset = Number(offset) + Number(limit)
        result.nextPage = `${baseRef}/?offset=${newOffset}&limit=${limit}`
    }

    if (offset > 0) {
        const newOffset = Math.max(Number(offset) - Number(limit), 0)
        result.prevPage = `${baseRef}/?offset=${newOffset}&limit=${limit}`
    }

    return result
}

const sanitizedBody = function (body) {
    const messageBody = { ...body }

    for (field in messageBody) {
        if (field.toLowerCase() === 'password') {
            // This should never really be an issue, but it's better to be safe
            messageBody[field] = '*'.repeat(20)
        }
    }

    return JSON.stringify(messageBody)
}

const reqErrorMessage = function (req) {
    return `${req.method} ${req.originalUrl} (${sanitizedBody(req.body)})`
}

const parseSQLError = function (req, SQLmessage) {
    const matched = SQLmessage.match(/SQLITE_(CONSTRAINT):\s*(\S+)\s*[^:]+:\s*(.+)/)
    if (!matched) return reqErrorMessage

    const [wholeMatch, errorType, errorName, fieldList] = matched
    const fieldsByTable = {}

    if (fieldList) {
        fieldList.split(/\s*,\s*/).forEach((fieldSpec) => {
            let [table, fieldName] = fieldSpec.split(/\s*\.\s*/)
            if (!fieldName) {
                fieldName = table
                table = 'none'
            }

            if (fieldsByTable[table]) {
                fieldsByTable[table][fieldName] = req.body[fieldName]
            } else {
                fieldsByTable[table] = { [fieldName]: req.body[fieldName] }
            }
        })
    } else {
        fieldsByTable.requestBody = sanitizedBody(req.body)
    }

    return `SQL ${errorName || 'unknown'} ${errorType || 'unknown'} (${JSON.stringify(fieldsByTable)})`
}

exports.routeErrorHandler = function (err, req, res, next) {
    if (err.status) {
        next(err, req, res, next)
    } else {
    // Log the original error in case our parsing is inadequate.
        console.warn(err, req.method, req.originalUrl, sanitizedBody(req.body))

        if (err.code) {
            const errorText = parseSQLError(req, err.message)
            next(createError(400, `Invalid request ${errorText}`))
        } else {
            next(createError(400, `Invalid request ${req.method} ${req.originalUrl} (${JSON.stringify(req.body)})`))
        }
    }
}

exports.normalizeList = function (normalizeModel) {
    return async (req, list) => {
        const newList = await list.map(async (model) => {
            const newModel = await normalizeModel(req, model)
            return newModel
        })

        return Promise.all(newList)
    }
}

exports.standardValidation = function (tableColumns) {
    if (!tableColumns || !Array.isArray(tableColumns)) throw new Error('Table columns must be specified as an array')
    return (req, res, next) => {
        switch (req.method.toLowerCase()) {
        case 'get':
        case 'delete':
            return next()

        case 'post':
        case 'put':
            const reqBody = { ...req.body }
            tableColumns.forEach((column, i) => {
                delete reqBody[column]
            })

            delete reqBody.id

            if (Object.keys(reqBody).length > 0) {
                res.status(400).send(`Unexpected data found: '${JSON.stringify(reqBody)}'`)
            } else {
                return next()
            }
            break

        default: res.status(500).send(`Unrecognized method ${req.method}`)
        }
    }
}

exports.validateForeignKey = async function (tableName, idValue) {
    const table = db.model(tableName)
    return await table.fetchById(idValue)
        .catch((err) => {
            return Promise.reject(`Invalid ${tableName} id specified: ${idValue}`)
        })
}

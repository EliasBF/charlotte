const debug = require('debug')('charlotte')
const Database = require('better-sqlite3')
const queries = require('./queries')

module.exports = class SqliteStorage {
    constructor (options) {
        this.options = options
        this.database = null
        this.validateOptions()
        this.initialize()
    }

    validateOptions () {
        if (!this.options.database) {
            throw new Error('database file not specified')
        }
    }

    initialize () {
        debug('Initialize sqlite')
        this.database = new Database(this.options.database)
        this.database.exec(queries.schema)
    }

    insertTraceback (traceback) {
        debug('Insert traceback')
        const statement = this.database.prepare(queries.insertTraceback)
        const result = statement.run(traceback)
        return result.lastInsertRowid
    }

    insertStacktrace (stacktrace) {
        debug('Insert stacktrace')
        const statement = this.database.prepare(queries.insertStacktrace)
        const result = statement.run(stacktrace)
        return result.lastInsertRowid
    }

    insertRequest (request) {
        debug('Insert request')
        const statement = this.database.prepare(queries.insertRequest)
        const result = statement.run(request)
        return result.lastInsertRowid
    }

    tracebackList () {
        debug('Get traceback list')
        const statement = this.database.prepare(queries.tracebackList)
        return statement.all()
    }

    stacktrace (id) {
        debug('Get stacktrace by id')
        const statement = this.database.prepare(queries.stacktrace)
        return statement.all({ traceback_id: id })
    }

    request (id) {
        debug('Get request by id')
        const statement = this.database.prepare(queries.request)
        return statement.get({ traceback_id: id })   
    }
}

const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

const chalk = require('chalk')
const moment = require('moment')
const pathToRegexp = require('path-to-regexp')
const Database = require('better-sqlite3')
const ErrorStackParser = require('error-stack-parser')

module.exports = class Charlotte {

    constructor () {
        this.start = null
        this.end = null
        this.koaContext = null

        // this.templateFilePath = path.join(require.resolve('charlotte'), 'exception.html')
        this.templateFilePath = path.join(process.cwd(), 'exception.html')
        // this.appBaseDirectory = path.join(require.resolve('charlotte'), 'app')
        this.appBaseDirectory = path.join(process.cwd(), 'app')
        this.readFile = promisify(fs.readFile)

        this.routes = [
            { matcher: pathToRegexp('/charlotte'), handler: this.index },
            { matcher: pathToRegexp('/charlotte/traceback'), handler: this.tracebackList },
            { matcher: pathToRegexp('/charlotte/traceback/:id'), handler: this.tracebackInfo },
            { matcher: pathToRegexp('/charlotte-favicon.ico'), handler: this.icon }
        ]

        this.storage = new Database('charlotte.db')
        this.initStorage()
    }

    // Sqlite

    initStorage () {
        this.storage.exec(`
            CREATE TABLE IF NOT EXISTS traceback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                file_location TEXT NOT NULL,
                node_executable TEXT NOT NULL,
                node_version TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                fixed_at INTEGER NULL,
                ignored_at INTEGER NULL
            );
            CREATE TABLE IF NOT EXISTS stacktrace (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NULL,
                function_name TEXT NULL,
                line_number INTEGER NULL,
                column_number INTEGER NULL,
                source INTEGER NULL,
                created_at INTEGER NOT NULL,
                traceback_id INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS request (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                params TEXT NULL,
                query TEXT NULL,
                body TEXT NULL,
                traceback_id INTEGER NOT NULL
            )
        `)
    }

    // Koa request logging

    log () {
        const logLevel = this.logLevel()

        if (logLevel === 'error') {
            process.stderr.write(this.formatMessage(true))
        }
        else {
            process.stdout.write(this.formatMessage())
        }
    }

    logLevel () {
        const status = this.koaContext.status
        return status >= 500
            ? 'error'
            : (status >= 400
                ? 'warn'
                : 'info')
    }

    colorize (level, log) {
        const color = level === 'error' ? 'red' : (level === 'warn' ? 'yellow' : 'green')
        return chalk[color](log)
    }

    formatMessage (isError) {
        const requestMethod = this.koaContext.method
        const requestUrl = this.koaContext.url
        const requestStatus = this.koaContext.status
        const requestTime = this.end - this.start
        const logLevel  = this.logLevel()
        const logMessage = `[${logLevel.toUpperCase()}][${new Date().toLocaleString()}] ${requestMethod} ${requestUrl} -> ${isError ? 'ERROR' : `${requestTime}ms`} (${requestStatus})\n`
        return this.colorize(logLevel, logMessage)
    }

    // Exception view

    renderStackTrace (traceback) {
        return traceback.map(trace => `
            <li>
                <h5>${trace.fileName} in ${trace.functionName || 'Anonymous function'}</h5>
                <p>
                    <span>Ln ${trace.lineNumber}, Col ${trace.columnNumber}.</span>
                    <span>${trace.source}</span>
                </p>
            </li>
        `)
        .join('')
        .trim()
    }

    async renderException (exception) {
        const exceptionTraceItems = ErrorStackParser.parse(exception)
        const templateContent = await this.readFile(this.templateFilePath)
        const compile =  (content, $ = '$') => Function($, 'return `' + content + '`;')

        return compile(templateContent.toString(), [
            'exceptionTitle',
            'exceptionMessage',
            'requestMethod',
            'requestUrl',
            'exceptionType',
            'exceptionValue',
            'exceptionLocation',
            'nodeExecutable',
            'nodeVersion',
            'serverTime',
            'tracebackList'
        ])(
            `${exception.name} at ${this.koaContext.path}`,
            exception.message,
            this.koaContext.method.toUpperCase(),
            this.koaContext.href,
            exception.name,
            exception.message,
            exceptionTraceItems[0]['fileName'],
            process.execPath,
            process.version,
            new Date().toGMTString(),
            this.renderStackTrace(exceptionTraceItems)
        )
    }

    // Route Handling

    matchRoute(path) {
        return this.routes.find(route => route.matcher.test(path))
    }

    async index () {
        const app = await this.readFile(path.join(this.appBaseDirectory, 'index.html'))
        this.koaContext.body = app.toString()
    }

    async tracebackList () {
        try {
            const stmt = this.storage.prepare('SELECT * FROM traceback ORDER BY created_at DESC LIMIT 10')
            const tracebacks = stmt.all()

            this.koaContext.body = {
                tracebacks: tracebacks.map(trace => {
                    return {
                        ...trace,
                        registered_at: moment(trace.created_at).fromNow()
                    }
                })
            }
        }
        catch (err) {
            this.koaContext.status = 500
            this.koaContext.body = err.message
        }
    }

    async tracebackInfo () {
        try {
            const traceback_id = Number(this.koaContext.url.split('/').pop())

            const stmtStack = this.storage.prepare('SELECT * FROM stacktrace WHERE traceback_id = :traceback_id')
            const stacktrace = stmtStack.all({ traceback_id })

            const stmtRequest = this.storage.prepare('SELECT * FROM request WHERE traceback_id = :traceback_id')
            const request = stmtRequest.get({ traceback_id })

            this.koaContext.body = {
                stacktrace: stacktrace.map(stack => {
                    return {
                        ...stack,
                        registered_at: moment(stack.created_at).fromNow()
                    }
                }),
                request
            }
        }
        catch (err) {
            this.koaContext.status = 500
            this.koaContext.body = err.message
        }
    }

    async icon () {
        const icon = await this.readFile(path.join(this.appBaseDirectory, 'favicon.ico'))
        this.koaContext.body = icon
    }

    // Tracking

    addTraceback (exception) {
        const exceptionTraceItems = ErrorStackParser.parse(exception)

        const stmtTrace = this.storage.prepare(`
        INSERT INTO traceback (
            type, message, file_location, node_executable,
            node_version, created_at, fixed_at, ignored_at
        ) VALUES (
            :type, :message, :file_location, :node_executable,
            :node_version, :created_at, :fixed_at, :ignored_at
        )`)

        const resultTrace = stmtTrace.run({
            type: exception.name,
            message: exception.message,
            file_location: exceptionTraceItems[0]['fileName'],
            node_executable: process.execPath,
            node_version: process.version,
            created_at: new Date().getTime(),
            fixed_at: null,
            ignored_at: null
        })

        const traceId = resultTrace.lastInsertRowid

        exceptionTraceItems.forEach(trace => {
            const stmtStack = this.storage.prepare(`
            INSERT INTO stacktrace (
                file_name, function_name, line_number,
                column_number, source, created_at, traceback_id
            ) VALUES (
                :file_name, :function_name, :line_number,
                :column_number, :source, :created_at, :traceback_id
            )
            `)

            stmtStack.run({
                file_name: trace.fileName,
                function_name: trace.functionName || 'Anonymous function',
                line_number: trace.lineNumber,
                column_number: trace.columnNumber,
                source: trace.source,
                created_at: new Date().getTime(),
                traceback_id: traceId
            })
        })

        const stmtRequest = this.storage.prepare(`
        INSERT INTO request (
            method, url, params, query, body, traceback_id
        ) VALUES (
            :method, :url, :params, :query, :body, :traceback_id
        )
        `)

        stmtRequest.run({
            method: this.koaContext.method.toUpperCase(),
            url: this.koaContext.href,
            params: JSON.stringify(this.koaContext.params),
            query: JSON.stringify(this.koaContext.query),
            body: JSON.stringify(this.koaContext.body),
            traceback_id: traceId
        })
    }
}

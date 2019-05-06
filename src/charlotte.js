const path = require('path')
const chalk = require('chalk')
const moment = require('moment')
const pathToRegexp = require('path-to-regexp')
const Database = require('better-sqlite3')
const ErrorStackParser = require('error-stack-parser')
const isObject = require('is-object')
const isFunction = require('is-function')
const htmlToText = require('html-to-text')
const { renderTemplate, openFile } = require('./templates')
const { sendLogEmail } = require('./mail')

module.exports = class Charlotte {

    constructor () {
        this.start = null
        this.end = null
        this.koaContext = null

        this.mail = {
            host: null,
            port: null,
            user: null,
            pass: null,
            from: null,
            to: null
        }

        // this.viewsPath = path.join(require.resolve('charlotte'), 'views')
        // this.appPath = path.join(require.resolve('charlotte'), 'app')
        this.viewsPath = path.join(process.cwd(), 'views')
        this.appPath = path.join(process.cwd(), 'app')
        
        this.createRoutes()
        this.prepareStorage()
    }

    startLog (time) {
        this.start = time || Date.now()
    }

    endLog (time) {
        this.end = time || Date.now()
    }

    context (ctx) {
        this.koaContext = ctx
    }

    createRoutes () {
        this.routes = [
            { matcher: pathToRegexp('/charlotte'), handler: this.index },
            { matcher: pathToRegexp('/charlotte/traceback'), handler: this.tracebackList },
            { matcher: pathToRegexp('/charlotte/traceback/:id'), handler: this.tracebackInfo },
            { matcher: pathToRegexp('/charlotte-favicon.ico'), handler: this.icon }
        ]
    }

    prepareMailing (config, callback) {
        if (!config && !callback) {
            this.mail = null
            return 
        }

        if (callback && isFunction(callback)) {
            this.onMail = (traceback) => callback(traceback)
            return
        }

        if (!isObject(config)) {
            throw new Error('Invalid config for mailing')
        }

        if (!('host' in config) ||
            !('user' in config) ||
            !('pass' in config) ||
            !('to' in config)) {
            throw new Error('Invalid config for mailing')
        }
        
        this.mail = {
            ...config,
            from: config.from || 'Charlotte <bot@charlotte.io>',
            port: config.port || 587
        }
    }

    prepareStorage () {
        this.storage = new Database('charlotte.db')

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

        return await renderTemplate(path.join(this.viewsPath, 'exception.html'), {
            'exceptionTitle': `${exception.name} at ${this.koaContext.path}`,
            'exceptionMessage': exception.message,
            'requestMethod': this.koaContext.method.toUpperCase(),
            'requestUrl': this.koaContext.href,
            'exceptionType': exception.name,
            'exceptionValue': exception.message,
            'exceptionLocation': exceptionTraceItems[0]['fileName'],
            'nodeExecutable': process.execPath,
            'nodeVersion': process.version,
            'serverTime': new Date().toGMTString(),
            'tracebackList': this.renderStackTrace(exceptionTraceItems)
        })
    }

    matchRoute(path) {
        return this.routes.find(route => route.matcher.test(path))
    }

    async index () {
        this.koaContext.body = await renderTemplate(path.join(this.appPath, 'index.html'))
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
        const icon = await openFile(path.join(this.appPath, 'favicon.ico'))
        this.koaContext.body = icon
    }

    addTraceback (exception) {
        const exceptionTraceItems = ErrorStackParser.parse(exception)

        const traceback = {
            type: exception.name,
            message: exception.message,
            file_location: exceptionTraceItems[0]['fileName'],
            node_executable: process.execPath,
            node_version: process.version,
            created_at: new Date().getTime(),
            fixed_at: null,
            ignored_at: null
        }

        const stmtTrace = this.storage.prepare(`
        INSERT INTO traceback (
            type, message, file_location, node_executable,
            node_version, created_at, fixed_at, ignored_at
        ) VALUES (
            :type, :message, :file_location, :node_executable,
            :node_version, :created_at, :fixed_at, :ignored_at
        )`)

        const resultTrace = stmtTrace.run(traceback)

        traceback.id = resultTrace.lastInsertRowid
        traceback.stack = []

        exceptionTraceItems.forEach(trace => {
            const traceInfo = {
                file_name: trace.fileName,
                function_name: trace.functionName || 'Anonymous function',
                line_number: trace.lineNumber,
                column_number: trace.columnNumber,
                source: trace.source,
                created_at: new Date().getTime(),
                traceback_id: traceback.id
            }

            const stmtStack = this.storage.prepare(`
            INSERT INTO stacktrace (
                file_name, function_name, line_number,
                column_number, source, created_at, traceback_id
            ) VALUES (
                :file_name, :function_name, :line_number,
                :column_number, :source, :created_at, :traceback_id
            )
            `)

            stmtStack.run(traceInfo)
            traceback.stack.push(traceInfo)
        })

        const stmtRequest = this.storage.prepare(`
        INSERT INTO request (
            method, url, params, query, body, traceback_id
        ) VALUES (
            :method, :url, :params, :query, :body, :traceback_id
        )
        `)

        traceback.request = {
            method: this.koaContext.method.toUpperCase(),
            url: this.koaContext.href,
            params: JSON.stringify(this.koaContext.params),
            query: JSON.stringify(this.koaContext.query),
            body: JSON.stringify(this.koaContext.body),
            traceback_id: traceback.id
        }

        stmtRequest.run(traceback.request)

        if (this.mail) {
            this.onMail(traceback)
        }
    }

    onMail (traceback, content) {
        this.mail.subject = `${traceback.type} at ${this.koaContext.path}`
        this.mail.html = content
        this.mail.plain = htmlToText.fromString(context)
        sendLogEmail(this.mail)
    }
}

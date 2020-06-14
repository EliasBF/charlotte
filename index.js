const Charlotte = require('./src/charlotte')

module.exports = (options) => {
    process.env.NODE_ENV = process.env.NODE_ENV || 'development'
    const charlotte = new Charlotte()
    charlotte.prepareMailing(options.mail, options.onMail)
    charlotte.prepareStorage(options.storage)

    return async function charlotteMiddleware (ctx, next) {
        charlotte.startLog()
        charlotte.context(ctx)

        try {
            const route = charlotte.matchRoute(ctx.path)

            if (route) {
                await route.handler.call(charlotte)
            }
            else {
                await next()
            }

            charlotte.endLog()
            charlotte.log()
        }
        catch (err) {
            ctx.status = 500
            charlotte.addTraceback(err)

            if (process.env.NODE_ENV === 'development') {
                ctx.body = await charlotte.renderException(err)
            }
            
            charlotte.endLog()
            charlotte.log()

            // in production rethrow for custom error handling
            if (process.env.NODE_ENV !== 'development') {
                throw err
            }
        }
    }
}

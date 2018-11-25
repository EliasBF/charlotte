const Charlotte = require('./charlotte')

module.exports = () => {
    const charlotte = new Charlotte()
    process.env.NODE_ENV = process.env.NODE_ENV || 'development'

    return async function charlotteMiddleware (ctx, next) {
        charlotte.start = Date.now()
        charlotte.koaContext = ctx

        try {
            const route = charlotte.matchRoute(ctx.path)

            if (route) {
                await route.handler.call(charlotte)
            }
            else {
                await next()
            }

            charlotte.end = Date.now()
            charlotte.log()
        }
        catch (err) {
            ctx.status = 500
            charlotte.addTraceback(err)

            if (process.env.NODE_ENV === 'development') {
                ctx.body = await charlotte.renderException(err)
            }
            
            charlotte.end = Date.now()
            charlotte.log()

            // in production rethrow for custom error handling
            if (process.env.NODE_ENV !== 'development') {
                throw err
            }
        }
    }
}

const Koa = require('koa')
const app = new Koa()

const charlotte = require('./index')

app.use(charlotte())
app.use(async ctx => {
    if (ctx.path.includes('test')) {
        throw new Error('Test error')
    }

    ctx.body = 'Hello World!'
})

app.listen(3000)

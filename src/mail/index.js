const nodemailer = require('nodemailer')
const EmailValidator = require('email-validator')

module.exports = {
  sendLogEmail
}

async function sendLogEmail(config) {
  if (validateEmails == false) {
    throw new Error('Invalid emails configured for mailing')
  }

  await createSmtpTransport(config)
  .sendMail({
    from: config.from,
    to: (config.to instanceof Array) ? config.to.join(',') : config.to,
    subject: config.subject,
    text: config.plain,
    html: config.html
  })
}

function createSmtpTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.pass
    }
  })
}

function validateEmails(config) {
  return [
    config.from,
    ...((config.to instanceof Array) ? config.to : [config.to])
  ]
  .every(email => EmailValidator.validate(email))
}
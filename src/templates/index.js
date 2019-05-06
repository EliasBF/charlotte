const fs = require('fs')
const { promisify } = require('util')

fs.readFile = promisify(fs.readFile)

module.exports = {
  renderTemplate,
  openFile
}

async function renderTemplate (templatePath, context) {
  const templateContent = await openFile(templatePath, 'utf-8')

  if (!context) {
    return templateContent
  }

  const compile = (content, $ = '$') => Function($, 'return `' + content + '`;')
  return compile(templateContent, Object.keys(context))(...Object.values(context))
}

async function openFile(path, encoding) {
  return await fs.readFile(path, encoding)
}
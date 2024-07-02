const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const glob = require('glob')
const Ajv = require('ajv-draft-04')
const convert = require('../index').convert

const ajv = new Ajv()
ajv.addMetaSchema(require('./schemas/openapi-3.0.json'))

function buildDocsBasedOnRoutes(pathPrefix, routesPathGlob) {
  const files = glob.globSync(path.resolve(__dirname, routesPathGlob), { windowsPathsNoEscape: true })
  console.log(routesPathGlob, files)

  const allModuleRoutes = []
  files.forEach((file) => {
    const moduleFile = path.relative(__dirname, file)
    const moduleRoutes = require(`./${moduleFile}`)

    allModuleRoutes.push(moduleRoutes)
  })

  return convert(allModuleRoutes, {
    servers: [{
      url: `http://localhost${pathPrefix}`
    }],
    info: {
      description: 'Helps to CRUD hero information.',
      version: '1.0.0',
      title: 'Hero API Docs'
    }
  })
}

const swagerDocJson = buildDocsBasedOnRoutes('/api', './fixtures/*-routes.js')

fs.writeFileSync('./test/sample_api_doc.json', JSON.stringify(swagerDocJson, null, 2))
const result = ajv.validateSchema(swagerDocJson)
if (!result) {
  console.error(JSON.stringify(ajv.errors, null, 2))
}

console.log('Sample api doc is written to ./test/sample_api_doc.json successfully.')

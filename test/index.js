const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Promise = require('bluebird');
const Validator = require('jsonschema').Validator;
const convert = require('../index').convert;

const swaggerSchema = require('./schemas/swagger-schema-2.0');
const jsonSchemaDraft = require('./schemas/json-schema-draft04');

const globPromise = Promise.promisify(glob);

const v = new Validator();
v.addSchema(swaggerSchema);
v.addSchema(jsonSchemaDraft);

function buildDocsBasedOnRoutes(pathPrefix, routesPathGlob) {
  return globPromise(path.resolve(__dirname, routesPathGlob), {})
    .then((files) => {
      const allModuleRoutes = [];
      files.forEach((file) => {
        const moduleFile = path.relative(__dirname, file);
        const moduleRoutes = require(`./${moduleFile}`);

        allModuleRoutes.push(moduleRoutes);
      });

      return convert(allModuleRoutes, {
        basePath: pathPrefix,
        info: {
          description: 'Helps to CRUD hero information.',
          version: '1.0.0',
          title: 'Hero API Docs'
        }
      });
    });
}

buildDocsBasedOnRoutes('/api', './fixtures/*-routes\.js')
  .then((swagerDocJson) => {
    v.validate(swagerDocJson, swaggerSchema);

    fs.writeFileSync('./test/sample_api_doc.json', JSON.stringify(swagerDocJson, null, 2));
    return process.exit(0);
  })
  .catch((e) => {
    console.error(e);
  });

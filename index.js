const _ = require('lodash')
const joi2json = require('joi-to-json')

const DOC_ROOT_TEMPLATE = {
  openapi: '3.0.1',
  info: {
    description: 'API Docs',
    version: '1.0.0',
    title: 'API Docs'
  },
  servers: [{
    url: 'http://localhost/'
  }],
  tags: [],
  paths: {},
  components: {
    schemas: {
      Error: {
        type: 'object',
        required: [
          'code',
          'err'
        ],
        properties: {
          code: {
            type: 'string'
          },
          err: {
            type: 'string'
          }
        }
      }
    }
  }
}

const ROUTE_DEF_TEMPLATE = {
  tags: [],
  summary: '',
  description: '',
  parameters: [],
  responses: {
    500: {
      description: 'When Server takes a nap.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/Error'
          }
        }
      }
    }
  }
}

function _messageDescriptionWithExample(schema) {
  if (!schema.description) {
    schema.description = ''
  }
  if (schema && schema.example) {
    schema.description += ` (Example: ${schema.example})`
  }
}

function _convertJsonSchemaToParamObj(jsonSchema, fieldName) {
  const schema = jsonSchema.properties[fieldName]

  const paramObj = _.pick(schema, ['description', 'examples'])
  paramObj.name = fieldName

  if (jsonSchema.required && jsonSchema.required.includes(fieldName)) {
    paramObj.required = true
  }
  if (!_.isEmpty(paramObj.examples)) {
    paramObj.example = paramObj.examples[0]
    delete paramObj.examples
  }
  paramObj.schema = _.omit(schema, [
    'description', 'example'
  ])
  paramObj.example = schema.example

  _messageDescriptionWithExample(paramObj)
  return paramObj
}

function addRouteParameters(sharedSchemas, route, validators, position) {
  const validator = validators ? validators[position] : null
  if (!validator) {
    return
  }

  const joiJsonSchema = joi2json(validators[position], 'open-api', sharedSchemas)
  delete joiJsonSchema.schemas

  _.forEach(joiJsonSchema.properties, (schema, field) => {
    const paramObj = _convertJsonSchemaToParamObj(joiJsonSchema, field)

    paramObj.in = position
    route.parameters.push(paramObj)
  })
}

function containsBinaryField(schema, sharedSchemas) {
  let anyBinaryField = _.some(schema.properties, (fieldDefn) => {
    if (fieldDefn.type === 'array') {
      return fieldDefn.items.format === 'binary'
    }
    return fieldDefn.format === 'binary'
  })

  if (!anyBinaryField && schema.$ref) {
    const sharedSchemaName = schema.$ref.replace('#/components/schemas/', '')
    anyBinaryField = containsBinaryField(sharedSchemas[sharedSchemaName])
  }

  return anyBinaryField
}

function addRequestBodyParams(sharedSchemas, swaggerReq, validators) {
  if (validators && validators.body) {
    const schema = joi2json(validators.body, 'open-api', sharedSchemas)
    delete schema.schemas

    let contentType = 'application/json'

    if (containsBinaryField(schema, sharedSchemas)) {
      contentType = 'multipart/form-data'
    }

    swaggerReq.requestBody = {
      content: {
        [contentType]: {
          schema
        }
      }
    }
  }
}

function addRequestPathParams(sharedSchemas, route, pathParams, validators) {
  let pathParamSchema
  if (validators && validators.path) {
    pathParamSchema = joi2json(validators.path, 'open-api', sharedSchemas)
    delete pathParamSchema.schemas
  }

  _.forEach(pathParams, (param) => {
    let schema = {
      name: param,
      required: true,
      schema: {
        type: 'string'
      }
    }

    if (pathParamSchema) {
      schema = _convertJsonSchemaToParamObj(pathParamSchema, param)
    }

    schema.in = 'path'
    if (!schema.description) {
      schema.description = ''
    }
    route.parameters.push(schema)
  })
}

function addResponseExample(sharedSchemas, routeDef, route) {
  _.forEach(routeDef.responseExamples, (example) => {
    if (!example.schema) {
      return
    }

    const schema = joi2json(example.schema, 'open-api', sharedSchemas)
    delete schema.schemas
    const mediaType = example.mediaType || 'application/json'

    route.responses[example.code] = {
      description: example.description || 'Normal Response',
      content: {
        [mediaType]: {
          schema
        }
      }
    }
  })
}

function buildSwaggerRequest(docEntity, routeEntity, tag, basePath, routeDef) {
  const action = _.isArray(routeDef.action) ? routeDef.action[routeDef.action.length - 1] : routeDef.action
  const actionName = action.name
  if (!actionName) {
    return
  }

  const routePaths = docEntity.paths
  const pathParams = []
  const pathComponents = (basePath + routeDef.path).split('/').map((component) => {
    if (component.indexOf(':') === 0) {
      pathParams.push(component.substring(1))
      return `{${component.substring(1)}}`
    }

    return component
  })

  const pathString = pathComponents.join('/')
  const routePath = routePaths[pathString] || {}
  routePaths[pathString] = routePath

  const swaggerReq = _.cloneDeep(routeEntity)
  swaggerReq.tags.push(tag)
  swaggerReq.summary = routeDef.summary
  swaggerReq.description = routeDef.description
  if (routeDef.deprecated) {
    swaggerReq.deprecated = routeDef.deprecated
  }

  routePath[routeDef.method] = swaggerReq

  const validators = routeDef.validators
  const sharedSchemas = docEntity.components.schemas

  addRequestPathParams(sharedSchemas, swaggerReq, pathParams, validators)
  addRouteParameters(sharedSchemas, swaggerReq, validators, 'query')
  addRouteParameters(sharedSchemas, swaggerReq, validators, 'header')
  addRequestBodyParams(sharedSchemas, swaggerReq, validators)

  addResponseExample(sharedSchemas, routeDef, swaggerReq)
}

function buildModuleRoutes(docEntity, routeEntity, moduleRoutes) {
  const moduleId = moduleRoutes.basePath.substring(1).replace(/\//g, '-')
  const tag = moduleRoutes.name || moduleId

  docEntity.tags.push({
    name: tag,
    description: moduleRoutes.description || moduleId
  })

  moduleRoutes.routes.forEach((routeDef) => {
    buildSwaggerRequest(docEntity, routeEntity, tag, moduleRoutes.basePath, routeDef)
  })
}

function convert(allModuleRoutes, docSkeleton, routeSkeleton) {
  const docEntity = _.assign({}, DOC_ROOT_TEMPLATE, docSkeleton)
  const routeEntity = _.assign({}, ROUTE_DEF_TEMPLATE, routeSkeleton)

  _.forEach(allModuleRoutes, (moduleRoutes) => {
    buildModuleRoutes(docEntity,  routeEntity, moduleRoutes)
  })

  return docEntity
}

module.exports = {
  convert
}

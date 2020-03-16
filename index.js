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

function _pickSwaggerSchemaCompatibleFields(schema) {
  const convertedSchema = _.pick(schema, [
    'title',
    'multipleOf',
    'maximum',
    'exclusiveMaximum',
    'minimum',
    'exclusiveMinimum',
    'maxLength',
    'minLength',
    'pattern',
    'maxItems',
    'minItems',
    'uniqueItems',
    'maxProperties',
    'minProperties',
    'required',
    'enum',
    'description',
    'format',
    'default',
    'type',

    'allOf',
    'oneOf',
    'anyOf',
    'not',
    'items',
    'properties',
    'additionalProperties'
  ])

  if (!_.isEmpty(schema.examples)) {
    convertedSchema.example = schema.examples[0]
  }
  if (!convertedSchema.description) {
    convertedSchema.description = ''
  }

  return convertedSchema
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
  paramObj.schema = _.omit(_pickSwaggerSchemaCompatibleFields(schema), [
    'description', 'example'
  ])

  _messageDescriptionWithExample(paramObj)
  return paramObj
}

function addRouteParameters(route, validators, position) {
  const validator = validators ? validators[position] : null
  if (!validator) {
    return
  }

  const joiJsonSchema = joi2json(validators[position])

  _.forEach(joiJsonSchema.properties, (schema, field) => {
    const paramObj = _convertJsonSchemaToParamObj(joiJsonSchema, field)

    paramObj.in = position
    route.parameters.push(paramObj)
  })
}

function _convertJsonSchemaToSwagger(jsonSchema) {
  _.forEach(jsonSchema.properties, (fieldSchema, field) => {
    jsonSchema.properties[field] = _pickSwaggerSchemaCompatibleFields(fieldSchema)

    fieldSchema = jsonSchema.properties[field]

    if (fieldSchema.type === 'object') {
      _convertJsonSchemaToSwagger(fieldSchema)
    } else if (fieldSchema.type === 'array') {
      if (fieldSchema.items.anyOf) {
        fieldSchema.items.anyOf = _.map(fieldSchema.items.anyOf, (item) => {
          return _convertJsonSchemaToSwagger(item)
        })
      } else {
        fieldSchema.items = _convertJsonSchemaToSwagger(fieldSchema.items)
      }
    }
  })

  const subSchemaFields = ['oneOf', 'allOf', 'anyOf']
  _.forEach(subSchemaFields, (field) => {
    if (!_.isEmpty(jsonSchema[field])) {
      jsonSchema[field] = _.map(jsonSchema[field], (subSchema) => {
        return _convertJsonSchemaToSwagger(subSchema)
      })
    }
  })

  return jsonSchema
}

function addRequestBodyParams(swaggerReq, validators) {
  if (validators && validators.body) {
    const bodySchema = joi2json(validators.body)
    const schema = _convertJsonSchemaToSwagger(bodySchema)

    let contentType = 'application/json'
    const anyBinaryField = _.some(schema.properties, (fieldDefn) => {
      return fieldDefn.format === 'binary'
    })

    if (anyBinaryField) {
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

function addRequestPathParams(route, pathParams, validators) {
  let pathParamSchema
  if (validators && validators.path) {
    pathParamSchema = joi2json(validators.path)
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

function addResponseExample(routeDef, route) {
  _.forEach(routeDef.responseExamples, (example) => {
    if (!example.schema) {
      return
    }

    const resSchema = joi2json(example.schema)
    const schema = _convertJsonSchemaToSwagger(resSchema)

    route.responses[example.code] = {
      description: example.description || 'Normal Response',
      content: {
        'application/json': {
          schema
        }
      }
    }
  })
}

function buildSwaggerRequest(docEntity, moduleId, basePath, routeDef) {
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

  const swaggerReq = _.cloneDeep(ROUTE_DEF_TEMPLATE)
  swaggerReq.tags.push(moduleId)
  swaggerReq.summary = routeDef.summary
  swaggerReq.description = routeDef.description

  routePath[routeDef.method] = swaggerReq

  const validators = routeDef.validators
  addRequestPathParams(swaggerReq, pathParams, validators)
  addRouteParameters(swaggerReq, validators, 'query')
  addRouteParameters(swaggerReq, validators, 'header')
  addRequestBodyParams(swaggerReq, validators)

  addResponseExample(routeDef, swaggerReq)
}

function buildModuleRoutes(docEntity, moduleRoutes) {
  const moduleId = moduleRoutes.basePath.substring(1).replace(/\//g, '-')

  docEntity.tags.push({
    name: moduleId,
    description: moduleRoutes.description || moduleId
  })

  moduleRoutes.routes.forEach((routeDef) => {
    buildSwaggerRequest(docEntity, moduleId, moduleRoutes.basePath, routeDef)
  })
}

function convert(allModuleRoutes, docSkeleton) {
  const docEntity = docSkeleton || DOC_ROOT_TEMPLATE

  docEntity.openapi = docEntity.openapi || DOC_ROOT_TEMPLATE.openapi
  docEntity.info = docEntity.info || DOC_ROOT_TEMPLATE.info
  docEntity.servers = docEntity.servers || DOC_ROOT_TEMPLATE.servers
  docEntity.tags = docEntity.tags || DOC_ROOT_TEMPLATE.tags
  docEntity.paths = docEntity.paths || DOC_ROOT_TEMPLATE.paths
  docEntity.components = DOC_ROOT_TEMPLATE.components

  _.forEach(allModuleRoutes, (moduleRoutes) => {
    buildModuleRoutes(docEntity, moduleRoutes)
  })

  return docEntity
}

module.exports.convert = convert

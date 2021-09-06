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

function _convertNullTypeToNullable(schema) {
  if (_.isArray(schema.type) && schema.type.includes('null')) {
    _.remove(schema.type, (t) => t === 'null')
    schema.nullable = true
    if (schema.type.length === 1) {
      schema.type = schema.type[0]
    }
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
  _convertNullTypeToNullable(convertedSchema)

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

function jsonSchemaToSwagger(jsonSchema) {
  _.forEach(jsonSchema.properties, (fieldSchema, field) => {
    jsonSchema.properties[field] = _pickSwaggerSchemaCompatibleFields(fieldSchema)

    fieldSchema = jsonSchema.properties[field]

    if (fieldSchema.type === 'object') {
      jsonSchemaToSwagger(fieldSchema)
    } else if (fieldSchema.type === 'array') {
      if (fieldSchema.items.anyOf) {
        fieldSchema.items.anyOf = _.map(fieldSchema.items.anyOf, (item) => {
          return jsonSchemaToSwagger(item)
        })
      } else {
        fieldSchema.items = jsonSchemaToSwagger(fieldSchema.items)
        _convertNullTypeToNullable(fieldSchema.items)
      }
    }
  })

  const subSchemaFields = ['oneOf', 'allOf', 'anyOf']
  _.forEach(subSchemaFields, (field) => {
    if (!_.isEmpty(jsonSchema[field])) {
      jsonSchema[field] = _.map(jsonSchema[field], (subSchema) => {
        return jsonSchemaToSwagger(subSchema)
      })
    }
  })

  return jsonSchema
}

function addRequestBodyParams(swaggerReq, validators) {
  if (validators && validators.body) {
    const bodySchema = joi2json(validators.body)
    const schema = jsonSchemaToSwagger(bodySchema)

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
    const schema = jsonSchemaToSwagger(resSchema)
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
  addRequestPathParams(swaggerReq, pathParams, validators)
  addRouteParameters(swaggerReq, validators, 'query')
  addRouteParameters(swaggerReq, validators, 'header')
  addRequestBodyParams(swaggerReq, validators)

  addResponseExample(routeDef, swaggerReq)
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
  convert,
  jsonSchemaToSwagger
}

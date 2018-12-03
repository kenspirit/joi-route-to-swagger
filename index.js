const _ = require('lodash');
const joi2json = require('joi-to-json-schema');

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
};

const ROUTE_DEF_TEMPLATE = {
  tags: [],
  summary: '',
  description: '',
  operationId: '',
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
};

function _addArrayItemsSchema(schema, joiDefinition) {
  if (joiDefinition.type === 'array') {
    if (joiDefinition.items) {
      if (_.isArray(joiDefinition.items.type)) {
        _.remove(joiDefinition.items.type, (type) => { return type === 'null' });
        schema.items = {
          anyOf: _.map(joiDefinition.items.type, (valueType) => {
            const subSchema = { type: valueType };
            if (valueType === 'array') {
              subSchema.items = {};
            }
            return subSchema;
          })
        }
      } else {
        _.forEach(joiDefinition.items.properties, (item) => {
          if (item.examples && item.example) {
            delete item.examples;
          }
        })
        schema.items = _.omit(joiDefinition.items, ['patterns']);
      }
    } else {
      schema.items = {};
    }
  }
}

function addRequestQueryParams(route, validators) {
  if (validators && validators.query) {
    const queryParams = joi2json(validators.query);
    _.forEach(queryParams.properties, (value, field) => {
      let description = value.description ? value.description : '';
      const example = value.examples && value.examples.length > 0 ? value.examples[0] : undefined;
      if (example) {
        description += ` Example: ${example}`;
      }

      // example is removed because it's not supported in swagger v2 schema
      const schema = {
        name: field,
        in: 'query',
        description,
        required: (queryParams.required || []).indexOf(field) > -1,
        example,
        schema: {
          type: value.type,
          maximum: value.maximum,
          default: value.default,
          enum: value.enum
        },
      };
      _addArrayItemsSchema(schema.schema, value);
      route.parameters.push(schema);
    });
  }
}

function addRequestHeaderParams(route, validators) {
  if (validators && validators.header) {
    const headers = joi2json(validators.header);
    _.forEach(headers.properties, (value, field) => {
      let description = value.description ? value.description : '';
      const example = value.examples && value.examples.length > 0 ? value.examples[0] : undefined;
      if (example) {
        description += ` Example: ${example}`;
      }

      // example is removed because it's not supported in swagger v2 schema
      const schema = {
        name: field,
        in: 'header',
        description,
        required: (headers.required || []).indexOf(field) > -1,
        example,
        schema: {
          type: value.type,
          maximum: value.maximum,
          default: value.default,
          enum: value.enum
        },
      };

      route.parameters.push(schema);
    });
  }
}

function buildEmbeddedSchema(entityDef) {
  const schema = {
    type: 'object',
    properties: {},
    required: []
  };

  schema.required = entityDef.required;

  _.forEach(entityDef.properties, (value, field) => {
    const description = value.description ? value.description : '';
    const example = value.examples && value.examples.length > 0 ? value.examples[0] : undefined;

    schema.properties[field] = {
      type: value.type,
      example,
      description
    };
    if (value.type === 'array') {
      _addArrayItemsSchema(schema.properties[field], value);
    }
    if (value.type === 'object') {
      schema.properties[field] = buildEmbeddedSchema(value);
    }
  });

  return schema;
}

function buildEntityDefinition(docEntity, entityName, entityDef) {
  const entity = {
    type: 'object',
    properties: {},
    required: []
  };

  entity.required = entityDef.required;
  _.forEach(entityDef.properties, (value, field) => {
    const description = value.description ? value.description : '';
    const example = value.examples && value.examples.length > 0 ? value.examples[0] : undefined;

    entity.properties[field] = {
      type: value.type,
      example,
      description
    };
    if (value.type === 'array') {
      _addArrayItemsSchema(entity.properties[field], value);
    }
    if (value.type === 'object') {
      const subEntityName = `${entityName}${_.capitalize(field)}Entity`;
      entity.properties[field].allOf = [{
        $ref: `#/components/schemas/${subEntityName}`
      }];
      buildEntityDefinition(docEntity, `${subEntityName}`, value);
    }
  });

  docEntity.components.schemas[entityName] = entity;

  return entity;
}

function addRequestBodyParams(moduleId, docEntity, swaggerReq, validators, actionName) {
  if (validators && validators.body) {
    const entityName = `${_.capitalize(moduleId)}${_.capitalize(actionName)}Entity`;

    swaggerReq.requestBody = {
      content: {
        'application/json': {
          schema: {
            $ref: `#/components/schemas/${entityName}`
          }
        }
      }
    };

    const queryParams = joi2json(validators.body);

    buildEntityDefinition(docEntity, entityName, queryParams);
  }
}

function addRequestPathParams(route, pathParams, validators) {
  let pathParamSchema;
  if (validators && validators.path) {
    pathParamSchema = joi2json(validators.path);
  }

  _.forEach(pathParams, (param) => {
    const paramSchema = _.get(pathParamSchema, `properties.${param}`);
    const schema = {
      name: param,
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      }
    };

    if (paramSchema) {
      schema.description = paramSchema.description || '';
      const example = paramSchema.examples && paramSchema.examples.length > 0 ? paramSchema.examples[0] : undefined;
      if (example) {
        schema.description += ` Example: ${example}`;
      }
      schema.example = example;
    }
    route.parameters.push(schema);
  });
}

function addResponseExample(routeDef, route) {
  _.forEach(routeDef.responseExamples, (example) => {
    if (!example.schema) {
      return;
    }

    const resSchema = joi2json(example.schema);

    route.responses[example.code] = {
      description: example.description || 'Normal Response',
      content: {
        'application/json': {
          schema: buildEmbeddedSchema(resSchema)
        }
      }
    };
  });
}

function buildSwaggerRequest(docEntity, moduleId, basePath, routeDef) {
  const action = _.isArray(routeDef.action) ? routeDef.action[routeDef.action.length - 1] : routeDef.action;
  const actionName = action.name;
  if (!actionName) {
    return;
  }

  const routePaths = docEntity.paths;
  const pathParams = [];
  const pathComponents = (basePath + routeDef.path).split('/').map((component) => {
    if (component.indexOf(':') === 0) {
      pathParams.push(component.substring(1));
      return `{${component.substring(1)}}`;
    }

    return component;
  });

  const pathString = pathComponents.join('/');
  const routePath = routePaths[pathString] || {};
  routePaths[pathString] = routePath;

  const swaggerReq = _.cloneDeep(ROUTE_DEF_TEMPLATE);
  swaggerReq.tags.push(moduleId);
  swaggerReq.summary = routeDef.summary;
  swaggerReq.description = routeDef.description;
  swaggerReq.operationId = actionName;

  routePath[routeDef.method] = swaggerReq;

  const validators = routeDef.validators;
  addRequestPathParams(swaggerReq, pathParams, validators);
  addRequestQueryParams(swaggerReq, validators);
  addRequestHeaderParams(swaggerReq, validators);
  addRequestBodyParams(moduleId, docEntity, swaggerReq, validators, actionName);

  addResponseExample(routeDef, swaggerReq);
}

function buildModuleRoutes(docEntity, moduleRoutes) {
  const moduleId = moduleRoutes.basePath.substring(1).replace(/\//, '-');

  docEntity.tags.push({
    name: moduleId,
    description: moduleRoutes.description || moduleId
  });

  moduleRoutes.routes.forEach((routeDef) => {
    buildSwaggerRequest(docEntity, moduleId, moduleRoutes.basePath, routeDef);
  });
}

function convert(allModuleRoutes, docSkeleton) {
  const docEntity = docSkeleton || DOC_ROOT_TEMPLATE;

  docEntity.openapi = docEntity.openapi || DOC_ROOT_TEMPLATE.openapi;
  docEntity.info = docEntity.info || DOC_ROOT_TEMPLATE.info;
  docEntity.servers = docEntity.servers || DOC_ROOT_TEMPLATE.servers;
  docEntity.tags = docEntity.tags || DOC_ROOT_TEMPLATE.tags;
  docEntity.paths = docEntity.paths || DOC_ROOT_TEMPLATE.paths;
  docEntity.components = DOC_ROOT_TEMPLATE.components;

  _.forEach(allModuleRoutes, (moduleRoutes) => {
    buildModuleRoutes(docEntity, moduleRoutes);
  });

  return docEntity;
}

module.exports.convert = convert;

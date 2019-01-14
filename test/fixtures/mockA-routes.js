const joi = require('joi');

function dummyMiddlewareA() { }
function dummyMiddlewareB() { }
function dummyMiddlewareC() { }
function dummyMiddlewareD() { }

const moduleRouteDef = {
  basePath: '/hero',
  description: 'Hero related APIs',
  routes: [
    {
      method: 'get',
      path: '/',
      summary: 'List',
      description: '',
      action: dummyMiddlewareA,
      validators: {
        query: joi.object().keys({
          productId: joi.string().example('621'),
          sort: joi.string().valid('createdAt', 'updatedAt').default('createdAt'),
          direction: joi.string().valid('desc', 'asc').default('desc'),
          limit: joi.number().integer().max(100).default(100),
          page: joi.number().integer()
        }).with('sort', 'direction')
      },
      responseExamples: [
        {
          code: 200,
          schema: joi.object().keys({
            code: joi.string().required().example('10000000').description('Status Code'),
            data: joi.object().keys({
              records: joi.array().items(joi.object().keys({
                _id: joi.string().example('59ba1f3c2e9787247e29da9b').description('Unique id of hero').required(),
                updatedAt: joi.string().example('2017-09-14T06:18:36.786Z').description('Data creation time').required(),
                createdAt: joi.string().example('2017-09-14T06:18:36.786Z').description('Data last update time').required(),
                nickName: joi.string().example('Ken').description('Nick name').required(),
                gender: joi.string().example('Male').description('Gender').required(),
                avatar: joi.string().description('Hero avatar'),
              })),
              totalCount: joi.number().integer().required().example(2).description('Total number of records'),
              page: joi.number().integer().required().example(1).description('Page Number')
            })
          })
        }
      ]
    },
    {
      method: 'post',
      path: '/',
      summary: 'Create',
      description: '',
      action: [dummyMiddlewareB, dummyMiddlewareC],
      validators: {
        body: joi.object().keys({
          nickName: joi.string().required().example('鹄思乱想').description('Hero Nickname'),
          avatar: joi.string().required(),
          gender: joi.string().valid('Male', 'Female', ''),
          skills: joi.array().items(joi.string()).example(['teleport', 'invisible']),
          certificate: joi.binary()
        })
      }
    },
    {
      method: 'post',
      path: '/:id',
      summary: 'Update',
      description: '',
      action: dummyMiddlewareB,
      validators: {
        body: joi.object().keys({
          nickName: joi.string().required(),
          avatar: joi.string().required(),
          skills: joi.array().items(joi.string())
        })
      }
    },
    {
      method: 'get',
      path: '/:id',
      summary: 'Open',
      description: '',
      action: [dummyMiddlewareB, dummyMiddlewareD]
    }
  ]
};

module.exports = moduleRouteDef;

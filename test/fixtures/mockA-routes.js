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
          sort: joi.string().valid('createdAt', 'updatedAt').default('createdAt'),
          direction: joi.string().valid('desc', 'asc').default('desc'),
          limit: joi.number().integer().max(100).default(100),
          page: joi.number().integer(),
          productId: joi.string()
        }).with('sort', 'direction')
      },
      responseExamples: [
        {
          code: 200,
          data: {
            err: null,
            data: {
              records: [
                {
                  _id: '59ba1f3c2e9787247e29da9b',
                  updatedAt: '2017-09-14T06:18:36.786Z',
                  createdAt: '2017-09-14T06:18:36.786Z',
                  nickName: 'Ken',
                  avatar: '',
                  gender: 'Male'
                }
              ],
              totalCount: 1,
              page: 1
            }
          }
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
          skills: joi.array().items(joi.string()).example(['teleport', 'invisible'])
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

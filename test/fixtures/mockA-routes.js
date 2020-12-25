/* eslint newline-per-chained-call: "off" */
const joi = require('joi')

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
          heroId: joi.string().example('621').description('Hero ID'),
          sort: joi.string().valid('createdAt', 'updatedAt').allow('', null).default('createdAt'),
          direction: joi.string().valid('desc', 'asc').default('desc'),
          limit: joi.number().integer().min(1).max(100).default(100).multiple(10),
          page: joi.number().integer().positive().greater(0).less(10)
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
                avatar: joi.string().description('Hero avatar')
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
          nickName: joi.string().required().example('鹄思乱想').description('Hero Nickname').min(3).max(20).regex(/^[a-z]+$/, { name: 'alpha', invert: true }),
          avatar: joi.string().required().uri(),
          icon: joi.string().meta({ contentMediaType: 'image/png' }),
          email: joi.string().email(),
          ip: joi.string().ip({ version: ['ipv4', 'ipv6'] }),
          hostname: joi.string().hostname().insensitive(),
          gender: joi.string().valid('Male', 'Female', ''),
          height: joi.number().precision(2),
          birthday: joi.date().iso(),
          birthTime: joi.date().timestamp('unix'),
          skills: joi.array().items(joi.alternatives(
            joi.string(),
            joi.object().keys({
              name: joi.string().example('teleport').alphanum().description('Skill Name').lowercase(),
              level: joi.number().integer().example(1).description('Skill Level')
            })
          )).min(1).max(3).unique().description('Skills'),
          retired: joi.boolean().truthy('yes').falsy('no').insensitive(false)
        }).unknown(true).description('Hero profile')
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
          avatar: joi.string().required().uri(),
          icon: joi.string().meta({ contentMediaType: 'image/png' }),
          email: joi.string().email(),
          height: joi.number().precision(2),
          skills: joi.array().items(joi.alternatives(
            joi.string(),
            joi.object().keys({
              name: joi.string().example('teleport').alphanum().description('Skill Name').lowercase(),
              level: joi.number().integer().example(1).description('Skill Level')
            })
          )).min(1).max(3).unique().description('Skills'),
          retired: joi.boolean().truthy('yes').falsy('no').insensitive(false),
          certificate: joi.binary().encoding('base64')
        }).unknown(true).description('Hero profile')
      }
    },
    {
      method: 'get',
      path: '/:id',
      summary: 'Open',
      description: '',
      action: [dummyMiddlewareB, dummyMiddlewareD],
      validators: {
        path: joi.object().keys({
          id: joi.number().required().description('Hero Id').example(1)
        })
      }
    },
    {
      method: 'get',
      path: '/deprecated/:id',
      deprecated: true,
      summary: 'Deprecated api',
      description: '',
      action: [dummyMiddlewareB],
      validators: {
        path: joi.object().keys({
          id: joi.number().required().description('Hero Id').example(1)
        })
      }
    }
  ]
}

module.exports = moduleRouteDef

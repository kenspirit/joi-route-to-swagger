const parseUrl = require('parseurl')
const send = require('@fastify/send')

require('http').createServer((request, response) => {
  send(request, parseUrl(request).pathname, { root: './test' })
    .pipe(response)
}).listen(8080).on('listening', () => {
  console.log('Swagger Doc url: http://localhost:8080/swagger-ui/index.html')
})

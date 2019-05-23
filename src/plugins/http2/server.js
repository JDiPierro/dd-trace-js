'use strict'

const web = require('./web')
const shimmer = require('shimmer')

function createWrapCreateServer (tracer, config) {
  config = web.normalizeConfig(config)

  function wrapEmit (emit) {
    return function emitWithTrace (event, stream, headers) {
      if (event === 'stream') {
        web.instrument(tracer, config, stream, headers, 'http2.stream')
      }

      return emit.apply(this, arguments)
    }
  }

  return function wrapCreateServer (createServer) {
    return function createServerWithTrace (options, handler) {
      const server = createServer.apply(this, arguments)

      shimmer.wrap(server, 'emit', wrapEmit)

      return server
    }
  }
}

module.exports = [
  {
    name: 'http2',
    versions: ['>=4'],
    patch (http2, tracer, config) {
      this.wrap(http2, 'createServer', createWrapCreateServer(tracer, config))
      this.wrap(http2, 'createSecureServer', createWrapCreateServer(tracer, config))
    },
    unpatch (http2) {
      this.unwrap(http2, 'createServer')
      this.unwrap(http2, 'createSecureServer')
    }
  }
]

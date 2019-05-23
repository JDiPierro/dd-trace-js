'use strict'

const shimmer = require('shimmer')

const log = require('../../log')

const analyticsSampler = require('../../analytics_sampler')
const urlFilter = require('../util/urlfilter')

const tags = require('../../../ext/tags')
const types = require('../../../ext/types')
const kinds = require('../../../ext/kinds')
const WEB = types.WEB
const SERVER = kinds.SERVER
const RESOURCE_NAME = tags.RESOURCE_NAME
const SERVICE_NAME = tags.SERVICE_NAME
const SPAN_TYPE = tags.SPAN_TYPE
const SPAN_KIND = tags.SPAN_KIND
const ERROR = tags.ERROR
const HTTP2_METHOD = tags.HTTP2_METHOD
const HTTP2_URL = tags.HTTP2_URL
const HTTP2_STATUS_CODE = tags.HTTP2_STATUS_CODE
const HTTP2_ROUTE = tags.HTTP2_ROUTE
const HTTP2_REQUEST_HEADERS = tags.HTTP2_REQUEST_HEADERS
const HTTP2_RESPONSE_HEADERS = tags.HTTP2_RESPONSE_HEADERS

// http2 header constants
const HTTP2_HEADER_AUTHORITY = ':authority'
const HTTP2_HEADER_SCHEME = ':scheme'
const HTTP2_HEADER_METHOD = ':method'
const HTTP2_HEADER_PATH = ':path'
const HTTP2_HEADER_STATUS = ':status'
const HTTP_STATUS_OK = 200

const web = {
  // Ensure the configuration has the correct structure and defaults.
  normalizeConfig (config) {
    config = config.server || config

    const headers = getHeadersToRecord(config)
    const validateStatus = getStatusValidator(config)
    const hooks = getHooks(config)
    const filter = urlFilter.getFilter(config)

    return Object.assign({}, config, {
      headers,
      validateStatus,
      hooks,
      filter
    })
  },

  instrument (tracer, config, stream, headers, name, callback) {
    if (stream._datadog) return

    this.patch(stream)

    const span = startSpan(tracer, config, stream, headers, name)

    // TODO: replace this with a REFERENCE_NOOP after we split http/express/etc
    const path = headers[HTTP2_HEADER_PATH]
    if (!config.filter(path)) {
      span.context()._sampling.drop = true
    }

    if (config.service) {
      span.setTag(SERVICE_NAME, config.service)
    }

    analyticsSampler.sample(span, config.analytics)

    wrapStreamEmit(stream)
    addResourceTags(stream, headers)
    addStreamTags(stream, headers)
    wrapStreamRespond(stream)

    return callback && tracer.scope().activate(span, () => callback(span))
  },

  // Prepare the stream for instrumentation.
  patch (stream) {
    Object.defineProperty(stream, '_datadog', {
      value: {
        span: null,
        paths: [],
        middleware: [],
        beforeEnd: []
      }
    })
  }
}
function startSpan (tracer, config, stream, headers, name) {
  stream._datadog.config = config

  if (stream._datadog.span) {
    stream._datadog.span.context()._name = name
    return stream._datadog.span
  }

  const childOf = tracer.scope().active()
  const span = tracer.startSpan(name, { childOf })

  stream._datadog.tracer = tracer
  stream._datadog.span = span

  return span
}

function finishSpan (stream) {
  if (stream._datadog.finished) return

  const span = stream._datadog.span

  stream._datadog.config.hooks.stream(span, stream)

  stream._datadog.span.finish()
  stream._datadog.finished = true
}

function wrapStreamEmit (stream) {
  shimmer.wrap(stream, 'emit', wrapEmit)

  function wrapEmit (emit) {
    return function emitWithTrace (event, args) {
      if (event === 'error') {
        addErrorTags(stream, args)
      } else if (event === 'close') {
        finishSpan(stream)
      }

      return emit.apply(this, arguments)
    }
  }
}

function wrapStreamRespond (stream) {
  const span = stream._datadog.span

  shimmer.wrap(stream, 'respond', wrapRespond)
  shimmer.wrap(stream, 'respondWithFD', wrapRespondWithFile)
  shimmer.wrap(stream, 'respondWithFile', wrapRespondWithFile)

  function wrapRespond (respond) {
    return function respondWithTrace (headers) {
      span.addTags({
        [HTTP2_STATUS_CODE]: headers[HTTP2_HEADER_STATUS] | 0 || HTTP_STATUS_OK
      })

      addStatusError(stream, headers)
      return respond.apply(this, arguments)
    }
  }

  function wrapRespondWithFile (respondWithFile) {
    return function respondWithFileWithTrace (file, headers) {
      // TODO: extractTags(stream, headers)
      return respondWithFile.apply(this, arguments)
    }
  }
}

function addErrorTags (stream, error) {
  stream._datadog.span.addTags({
    'error.type': error.name,
    'error.msg': error.message,
    'error.stack': error.stack
  })
}

function addStreamTags (stream, headers) {
  const span = stream._datadog.span
  const url = `${headers[HTTP2_HEADER_SCHEME]}://${headers[HTTP2_HEADER_AUTHORITY]}${headers[HTTP2_HEADER_PATH]}`

  span.addTags({
    [HTTP2_METHOD]: headers[HTTP2_HEADER_METHOD],
    [HTTP2_URL]: url.split('?')[0],
    [SPAN_KIND]: SERVER,
    [SPAN_TYPE]: WEB
  })
}

function addResourceTags (stream, headers) {
  const span = stream._datadog.span
  const tags = span.context()._tags
  const method = headers[HTTP2_HEADER_METHOD]
  if (tags[RESOURCE_NAME]) return

  const resource = [method]
    .concat(tags[HTTP2_ROUTE])
    .filter(val => val)
    .join(' ')

  span.setTag(RESOURCE_NAME, resource)
}

function addStatusError (stream, headers) {
  if (!stream._datadog.config.validateStatus(headers[HTTP2_HEADER_STATUS])) {
    stream._datadog.span.setTag(ERROR, true)
  }
}

function getHeadersToRecord (config) {
  if (Array.isArray(config.headers)) {
    try {
      return config.headers.map(key => key.toLowerCase())
    } catch (err) {
      log.error(err)
    }
  } else if (config.hasOwnProperty('headers')) {
    log.error('Expected `headers` to be an array of strings.')
  }
  return []
}

function getStatusValidator (config) {
  if (typeof config.validateStatus === 'function') {
    return config.validateStatus
  } else if (config.hasOwnProperty('validateStatus')) {
    log.error('Expected `validateStatus` to be a function.')
  }
  return code => code < 500
}

function getHooks (config) {
  const noop = () => {}
  const stream = (config.hooks && config.hooks.stream) || noop

  return { stream }
}

module.exports = web

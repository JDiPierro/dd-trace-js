'use strict'

const tags = {
  // Common
  SERVICE_NAME: 'service.name',
  RESOURCE_NAME: 'resource.name',
  SPAN_TYPE: 'span.type',
  SPAN_KIND: 'span.kind',
  SAMPLING_PRIORITY: 'sampling.priority',
  ANALYTICS: '_dd1.sr.eausr',
  ERROR: 'error',
  MANUAL_KEEP: 'manual.keep',
  MANUAL_DROP: 'manual.drop',

  // HTTP
  HTTP_URL: 'http.url',
  HTTP_METHOD: 'http.method',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_ROUTE: 'http.route',
  HTTP_REQUEST_HEADERS: 'http.request.headers',
  HTTP_RESPONSE_HEADERS: 'http.response.headers',

  // HTTP2
  HTTP2_URL: 'http2.url',
  HTTP2_METHOD: 'http2.method',
  HTTP2_STATUS_CODE: 'http2.status_code',
  HTTP2_ROUTE: 'http2.route',
  HTTP2_REQUEST_HEADERS: 'http2.stream.headers',
  HTTP2_RESPONSE_HEADERS: 'http2.stream.headers'
}

// Deprecated
tags.ANALYTICS_SAMPLE_RATE = tags.ANALYTICS

module.exports = tags

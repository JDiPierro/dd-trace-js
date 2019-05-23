'use strict'

const fs = require('fs')
const path = require('path')
const getPort = require('get-port')
const agent = require('../agent')

wrapIt()

describe('Plugin', () => {
  let plugin
  let http2
  let listener
  let appListener
  let tracer
  let port
  let server

  describe('http2/server', () => {
    function client (authority, options, listener) {
      return http2.connect(authority, options, listener)
    }

    beforeEach(() => {
      plugin = require('../../../src/plugins/http2/server')
      tracer = require('../../..')
      listener = (stream, headers) => {
        stream.respond({
          'content-type': 'text/html',
          ':status': 200
        })
        stream.end('stream ended')
      }
    })

    beforeEach(() => {
      return getPort().then(newPort => {
        port = newPort
      })
    })

    afterEach(() => {
      appListener && appListener.close()
      server && server.close()
      return agent.close()
    })

    describe('without configuration', () => {
      beforeEach(() => {
        return agent.load(plugin, 'http2')
          .then(() => {
            http2 = require('http2')
          })
      })

      beforeEach(done => {
        const options = {
          key: fs.readFileSync(path.join(__dirname, './ssl/test.key')),
          cert: fs.readFileSync(path.join(__dirname, './ssl/test.crt'))
        }
        server = http2.createServer(options)
        server.on('stream', listener)
        appListener = server.listen(port, 'localhost', done)
      })

      it('should do automatic instrumentation', done => {
        agent
          .use(traces => {
            expect(traces[0][0]).to.have.property('name', 'http2.stream')
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('type', 'web')
            expect(traces[0][0]).to.have.property('resource', 'GET')
            expect(traces[0][0].meta).to.have.property('span.kind', 'server')
            expect(traces[0][0].meta).to.have.property('http2.url', `http://localhost:${port}/user`)
            expect(traces[0][0].meta).to.have.property('http2.method', 'GET')
            expect(traces[0][0].meta).to.have.property('http2.status_code', '200')
          })
          .then(done)
          .catch(done)

        client(`http://localhost:${port}`)
          .request({ ':path': '/user' })
          .on('error', done)
      })

      it('should include errors as tags if an error occurs', done => {
        let error

        agent
          .use(traces => {
            expect(traces[0][0]).to.have.property('name', 'http2.stream')
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('type', 'web')
            expect(traces[0][0]).to.have.property('resource', 'GET')
            expect(traces[0][0].meta).to.have.property('span.kind', 'server')
            expect(traces[0][0].meta).to.have.property('http2.url', `http://localhost:${port}/user`)
            expect(traces[0][0].meta).to.have.property('http2.method', 'GET')
            expect(traces[0][0].meta).to.have.property('http2.status_code', '200')
            expect(traces[0][0].meta).to.have.property('error.type', error.name)
            expect(traces[0][0].meta).to.have.property('error.msg', error.message)
            expect(traces[0][0].meta).to.have.property('error.stack', error.stack)
          })
          .then(done)
          .catch(done)

        server.once('stream', (stream) => {
          stream.on('error', (err) => {
            error = err
          })
          stream.end('all your base are belong to us')
        })

        client(`http://localhost:${port}`)
          .request({ ':path': '/user' })
      })
      /*
      it('should run the request listener in the request scope', done => {
        if (process.env.DD_CONTEXT_PROPAGATION === 'false') return done()

        client(`http://localhost:${port}`)
          .request({ ':path': '/user' })
          .on('response', () => {
            expect(tracer.scope().active()).to.not.be.null
            done()
          })
      })
      */
    })
  })
})

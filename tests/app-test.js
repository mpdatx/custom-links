'use strict'

var appLib = require('../lib')
var assembleApp = appLib.assembleApp
var sessionParams = appLib.sessionParams
var RedirectDb = require('../lib/redirect-db')
var express = require('express')
var request = require('supertest')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var expect = chai.expect
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

describe('assembleApp', function() {
  var app, redirectDb, logger, logError

  before(function() {
    redirectDb = new RedirectDb
    logger = { error: function() { } }
    app = new assembleApp(express(), redirectDb, logger)
  })

  beforeEach(function() {
    logError = sinon.spy(logger, 'error')
  })

  afterEach(function() {
    logError.restore()
  })

  describe('get homepage and redirects', function() {
    var getRedirect

    beforeEach(function() {
      getRedirect = sinon.stub(redirectDb, 'getRedirect')
    })

    afterEach(function() {
      getRedirect.restore()
    })

    it('returns the index page', function() {
      return request(app)
        .get('/')
        .expect(200, /Url Pointers/)
    })

    it('redirects to the url returned by the RedirectDb', function() {
      var redirectLocation = 'https://mike-bland.com/'
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(
          { location: redirectLocation, owner: 'mbland', count: 27 }))

      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', redirectLocation)
    })

    it('redirects to the homepage with nonexistent url parameter', function() {
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(null))

      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', '/?url=/foo')
    })

    it('reports an error', function() {
      getRedirect.withArgs('/foo', { recordAccess: true })
        .callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

      return request(app)
        .get('/foo')
        .expect(500, 'Internal Server Error')
        .then(function() {
          logError.calledOnce.should.be.true
          expect(logError.args[0][0].message).to.equal('forced error')
        })
    })
  })

  describe('API', function() {
    describe('unknown or malformed request', function() {
      it('returns bad request', function() {
        return request(app)
          .get('/api')
          .expect(400, 'Bad Request')
      })
    })

    describe('/info', function() {
      var getRedirect

      beforeEach(function() {
        getRedirect = sinon.stub(redirectDb, 'getRedirect')
      })

      afterEach(function() {
        getRedirect.restore()
      })

      it('returns info for an existing URL', function() {
        var urlData = {
          location: 'https://mike-bland.com/', owner: 'mbland', count: 27 }
        getRedirect.withArgs('/foo').returns(Promise.resolve(urlData))

        return request(app)
          .get('/api/info/foo')
          .expect(200)
          .then(function(response) {
            response.body.should.eql(urlData)
          })
      })

      it('returns not found', function() {
        getRedirect.withArgs('/foo').returns(Promise.resolve(null))

        return request(app)
          .get('/api/info/foo')
          .expect(404, 'Not Found')
      })

      it('returns server error', function() {
        getRedirect.withArgs('/foo').callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

        return request(app)
          .get('/api/info/foo')
          .expect(500, 'Internal Server Error')
          .expect(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message).to.equal('forced error')
          })
      })
    })
  })
})

describe('sessionParams', function() {
  it('uses default session store and max age', function() {
    var params = sessionParams({SESSION_SECRET: 'secret'})
    params.should.eql({
      store: undefined,
      secret: 'secret',
      resave: true,
      saveUnitialized: false,
      maxAge: appLib.DEFAULT_SESSION_MAX_AGE * 1000
    })
  })

  it('uses supplied session store and configured max age', function() {
    var config = { SESSION_SECRET: 'secret', SESSION_MAX_AGE: 3600 },
        store = {},
        params = sessionParams(config, store)

    params.should.eql({
      store: store,
      secret: 'secret',
      resave: true,
      saveUnitialized: false,
      maxAge: 3600 * 1000
    })
  })

  it('uses session store with touch method and null max age', function() {
    var config = { SESSION_SECRET: 'secret', SESSION_MAX_AGE: null },
        store = { touch: true },
        params = sessionParams(config, store)

    params.should.eql({
      store: store,
      secret: 'secret',
      resave: false,
      saveUnitialized: false,
      maxAge: null
    })
  })

  it('throws an error when max age is negative', function() {
    expect(function() { sessionParams({ SESSION_MAX_AGE: -1 }) })
      .to.throw(Error, 'SESSION_MAX_AGE cannot be negative: -1')
  })
})

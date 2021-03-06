'use strict'

var auth = require('../../lib/auth')
var testAuth = require('../../lib/auth/test')
var googleAuth = require('../../lib/auth/google')
var oktaAuth = require('../../lib/auth/openidconnect')
var LinkDb = require('../../lib/link-db')

var sinon = require('sinon')
var chai = require('chai')
var expect = chai.expect
var chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiAsPromised)

describe('auth', function() {
  var linkDb, stubs, stubDbMethod

  before(function() {
    linkDb = new LinkDb
    stubs = []
  })

  afterEach(function() {
    stubs.forEach(function(stub) {
      stub.restore()
    })
  })

  stubDbMethod = function(method) {
    var stub = sinon.stub(linkDb, method)
    stubs.push(stub)
    return stub
  }

  describe('findVerifiedId', function() {
    it('fails on all empty data', function() {
      expect(auth.findVerifiedId([], {})).to.be.undefined
    })

    it('fails on empty user ID list', function() {
      expect(auth.findVerifiedId([],
        { users: [ 'mbland@acm.org' ], domains: [ 'acm.org' ]})
        ).to.be.undefined
    })

    it('succeeds on username match', function() {
      auth.findVerifiedId(['mbland@example.com', 'mbland@acm.org'],
        { users: [ 'mbland@foo.com', 'mbland@acm.org' ]})
        .should.equal('mbland@acm.org')
    })

    it('succeeds on domain match', function() {
      auth.findVerifiedId(['mbland@example.com', 'mbland@acm.org'],
        { domains: [ 'foo.com', 'acm.org' ]})
        .should.equal('mbland@acm.org')
    })

    it('converts user IDs to lowercase', function() {
      auth.findVerifiedId(['MBland@acm.org'],
        { users: [ 'mbland@acm.org' ], domains: [ 'acm.org' ]})
        .should.equal('mbland@acm.org')
    })
  })

  describe('verify', function() {
    var doVerify

    doVerify = function(config, userIds) {
      return new Promise(function(resolve, reject) {
        auth.verify(linkDb, config, userIds, function(err, user) {
          err ? reject(err) : resolve(user)
        })
      })
    }

    it('verifies a user ID', function() {
      stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
        .returns(Promise.resolve({ id: 'mbland@acm.org' }))
      doVerify({ users: [ 'mbland@acm.org' ]}, [ 'mbland@acm.org' ])
        .should.become({ id: 'mbland@acm.org' })
    })

    it('fails to verify a user ID', function() {
      doVerify({}, [ 'mbland@acm.org' ]).should.become(false)
    })

    it('returns an error if a LinkDb operation fails', function() {
      stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
        .callsFake(function(user) {
          return Promise.reject(new Error('forced error for ' + user))
        })

      doVerify({ users: [ 'mbland@acm.org' ]}, [ 'mbland@acm.org' ])
        .should.be.rejectedWith(Error, 'forced error for mbland@acm.org')
    })
  })

  describe('serializeUser', function() {
    it('serializes the user ID', function() {
      return new Promise(
        function(resolve, reject) {
          var serializeUser = auth.makeUserSerializer(linkDb)
          serializeUser({ id: 'mbland@acm.org' }, function(err, user) {
            err ? reject(err) : resolve(user)
          })
        })
        .should.become('mbland@acm.org')
    })
  })

  describe('deserializeUser', function() {
    var doDeserialize

    doDeserialize = function(user) {
      var deserializeUser = auth.makeUserDeserializer(linkDb)
      return new Promise(function(resolve, reject) {
        deserializeUser(user, function(err, user) {
          err ? reject(err) : resolve(user)
        })
      })
    }

    it('deserializes the user ID', function() {
      stubDbMethod('userExists').withArgs('mbland@acm.org')
        .returns(Promise.resolve())

      return doDeserialize('mbland@acm.org')
        .should.become({ id: 'mbland@acm.org' })
    })

    it('fails to deserialize the user ID', function() {
      stubDbMethod('userExists').withArgs('mbland@acm.org')
        .returns(Promise.reject('user mbland@acm.org doesn\'t exist'))

      return doDeserialize('mbland@acm.org')
        .should.be.rejectedWith('user mbland@acm.org doesn\'t exist')
    })
  })

  describe('strategies', function() {
    var passport = { use: function() { } }
    var doVerify = function(authProvider, userObj, config) {
      var verify = authProvider.verify(linkDb, config)
      return new Promise(function(resolve, reject) {
        verify('access token', 'refresh token', userObj, function(err, user) {
          err ? reject(err) : resolve(user)
        })
      })
    }

    beforeEach(function() {
      sinon.spy(passport, 'use')
    })

    afterEach(function() {
      passport.use.restore()
    })

    describe('test', function() {
      var strategy

      beforeEach(function() {
        process.env.CUSTOM_LINKS_TEST_AUTH = 'mbland@acm.org'
        testAuth.assemble(passport, linkDb, { users: [ 'mbland@acm.org' ] })
        strategy = passport.use.getCall(0).args[0]
      })

      afterEach(function() {
        delete process.env.CUSTOM_LINKS_TEST_AUTH
      })

      it('registers the strategy with passport.use', function() {
        strategy.name.should.equal('test')
      })

      it('throws an error if CUSTOM_LINKS_TEST_AUTH not set', function() {
        delete process.env.CUSTOM_LINKS_TEST_AUTH
        expect(function() { strategy.authenticate() })
          .to.throw(Error, 'CUSTOM_LINKS_TEST_AUTH must be defined')
      })

      it('redirects from /auth to /auth/callback', function() {
        strategy.redirect = sinon.spy()
        strategy.authenticate({ path: '/auth' }, { opts: true })
        strategy.redirect.getCall(0).args.should.eql(['/auth/callback'])
      })

      it('returns success from /auth/callback succeeds', function() {
        stubDbMethod('findOrCreateUser')
          .returns(Promise.resolve({ id: 'mbland@acm.org' }))
        strategy.success = sinon.spy()

        return strategy.authenticate({ path: '/auth/callback' }, { opts: true })
          .should.be.fulfilled.then(function() {
            strategy.success.getCall(0).args.should.eql(
              [ { id: 'mbland@acm.org' }, { opts: true } ])
          })
      })

      it('returns failure from /auth/callback on error', function() {
        stubDbMethod('findOrCreateUser').callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })
        strategy.fail = sinon.spy()

        return strategy.authenticate({ path: '/auth/callback' }, { opts: true })
          .should.be.rejectedWith(Error, 'forced error')
          .then(function() {
            strategy.fail.calledOnce.should.be.true
          })
      })

      it('returns failure from /auth/callback for an unknown user', function() {
        process.env.CUSTOM_LINKS_TEST_AUTH = 'bogus@unknown.com'
        strategy.fail = sinon.spy()

        return strategy.authenticate({ path: '/auth/callback' }, { opts: true })
          .should.be.rejectedWith('unknown user: bogus@unknown.com')
          .then(function() {
            strategy.fail.calledOnce.should.be.true
          })
      })

      it('succeeds when CUSTOM_LINKS_TEST_AUTH present', function() {
        strategy.success = sinon.spy()
        strategy.authenticate({ path: '/' }, { opts: true })
        strategy.success.getCall(0).args.should.eql(
          [ { id: 'mbland@acm.org' }, { opts: true } ])
      })

      it('fails when CUSTOM_LINKS_TEST_AUTH === "fail"', function() {
        strategy.fail = sinon.spy()
        process.env.CUSTOM_LINKS_TEST_AUTH = 'fail'
        strategy.authenticate({ path: '/auth/callback' }, { opts: true })
        strategy.fail.calledOnce.should.be.true
      })
    })

    describe('google', function() {
      var userInfo

      beforeEach(function() {
        userInfo = {
          emails: [
            { value: 'mbland@example.com', type: 'account' },
            { value: 'mbland@acm.org', type: 'account' }
          ]
        }
      })

      it('registers the strategy with passport.use', function() {
        googleAuth.assemble(passport, linkDb, {
          GOOGLE_CLIENT_ID: '<client-id>',
          GOOGLE_CLIENT_SECRET: '<client-secret>',
          GOOGLE_CALLBACK_URL: '<callback-url>'
        })
        expect(passport.use.getCall(0).args[0].name).to.equal('google')
      })

      it('successfully verifies the user', function() {
        stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
          .returns(Promise.resolve({ id: 'mbland@acm.org' }))

        return doVerify(googleAuth, userInfo, { users: [ 'mbland@acm.org' ]})
          .should.become({ id: 'mbland@acm.org' })
      })
    })

    describe('okta', function() {
      var userInfo

      beforeEach(function() {
        userInfo = {
          _json : {
            email: 'akash@example.com'
          }
        }
      })

      it('registers the strategy with passport.use', function() {
        oktaAuth.assemble(passport, linkDb, {
          OKTA_CLIENT_ID: '<client-id>',
          OKTA_CLIENT_SECRET: '<client-secret>',
          OKTA_ISSUER: '<issuer>',
          OKTA_AUTHORIZATION_URL: '<authorization-url>',
          OKTA_TOKEN_URL: '<okta-token-url>',
          OKTA_USER_INFO_URL: '<okta-user-info-url>',
          OKTA_CALLBACK_URL: '<okta-callback-url>'
        })
        expect(passport.use.getCall(0).args[0].name).to.equal('openidconnect')
      })

      it('successfully verifies the user', function() {
        stubDbMethod('findOrCreateUser').withArgs('akash@example.com')
          .returns(Promise.resolve({ id: 'akash@example.com' }))

        return doVerify(oktaAuth, userInfo, { users: [ 'akash@example.com' ]})
          .should.become({ id: 'akash@example.com' })
      })
    })
  })

  describe('assemble', function() {
    var passport = {
      use: function() { },
      serializeUser: function() { },
      deserializeUser: function() { }
    }

    beforeEach(function() {
      sinon.stub(passport, 'use')
      sinon.stub(passport, 'serializeUser')
      sinon.stub(passport, 'deserializeUser')
    })

    afterEach(function() {
      passport.deserializeUser.restore()
      passport.serializeUser.restore()
      passport.use.restore()
    })

    it('uses no auth providers', function() {
      var serializeUser,
          deserializeUser,
          serializeSpy = sinon.spy()

      auth.assemble(passport, linkDb, { AUTH_PROVIDERS: [] })
      passport.use.notCalled.should.be.true

      serializeUser = passport.serializeUser.getCall(0).args[0]
      deserializeUser = passport.deserializeUser.getCall(0).args[0]

      serializeUser({ id: 'mbland' }, serializeSpy)
      serializeSpy.getCall(0).args.should.eql([ null, 'mbland' ])

      stubDbMethod('findUser').withArgs('mbland')
        .returns(Promise.resolve({ id: 'mbland' }))

      return new Promise(
        function(resolve, reject) {
          deserializeUser('mbland', function(err, user) {
            err ? reject(err) : resolve(user)
          })
        })
        .should.become({ id: 'mbland' })
    })

    it('uses the test auth provider', function() {
      auth.assemble(passport, linkDb, { AUTH_PROVIDERS: ['test'] })
      expect(passport.use.getCall(0).args[0].name).to.equal('test')
    })

    it('uses multiple auth providers', function() {
      auth.assemble(passport, linkDb, {
        AUTH_PROVIDERS: [ 'google', 'test' ],
        GOOGLE_CLIENT_ID: '<client-id>',
        GOOGLE_CLIENT_SECRET: '<client-secret>',
        GOOGLE_CALLBACK_URL: '<redirect-url>'
      })
      expect(passport.use.getCall(0).args[0].name).to.equal('google')
      expect(passport.use.getCall(1).args[0].name).to.equal('test')
    })

    it('raises an error for an unknown auth provider', function() {
      var assemble = function() {
        auth.assemble(passport, linkDb, { AUTH_PROVIDERS: [ 'bogus' ] })
      }
      expect(assemble).to.throw(Error,
        'Failed to load bogus provider: Cannot find module \'./auth/bogus\'')
    })
  })
})

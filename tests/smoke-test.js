'use strict'

var path = require('path')
var helpers = require('./helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiAsPromised)

describe('Smoke test', function() {
  var testConfig = path.join(__dirname, 'helpers', 'system-test-config.json'),
      doLaunch,
      serverInfo

  this.timeout(5000)

  beforeEach(function() {
    serverInfo = null
    delete process.env.URL_POINTERS_CONFIG_PATH
  })

  afterEach(function() {
    delete process.env.URL_POINTERS_CONFIG_PATH
    if (serverInfo === null) {
      return
    }
    return helpers.killServer(serverInfo.server).then(function() {
      return helpers.killServer(serverInfo.redis.server)
    })
  })

  doLaunch = function(configPath) {
    return helpers.launchAll(configPath).should.be.fulfilled
      .then(function(result) {
        serverInfo = result
        serverInfo.output.stdout.should.have.string(
          helpers.PACKAGE_INFO.name + ' listening on port ')
        serverInfo.output.stderr.should.equal('')
      })
  }

  it('launches using the default system-test-config.json', function() {
    return doLaunch()
  })

  it('launches using a config path command line argument', function() {
    return doLaunch(testConfig)
  })

  it('launches using URL_POINTERS_CONFIG_PATH', function() {
    process.env.URL_POINTERS_CONFIG_PATH = testConfig
    return doLaunch()
  })

  it('fails to launch due to missing variables', function() {
    return doLaunch(null).should.be.rejectedWith(Error,
      'missing AUTH_PROVIDERS')
  })
})

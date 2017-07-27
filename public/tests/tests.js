/* eslint-env browser, mocha */
/* global expect, sinon */
'use strict'

describe('Custom Links', function() {
  var cl = window.cl,
      clTest = window.clTest,
      spyOn,
      stubOut,
      doubles = [],
      REDIRECT_LOCATION = 'https://mike-bland.com/'

  beforeEach(function() {
    stubOut('xhr')
  })

  afterEach(function() {
    doubles.forEach(function(double) {
      double.restore()
    })
  })

  spyOn = function(functionName) {
    var spy = sinon.spy(cl, functionName)
    doubles.push(spy)
    return spy
  }

  stubOut = function(functionName) {
    var stub = sinon.stub(cl, functionName)
    doubles.push(stub)
    return stub
  }

  describe('showView', function() {
    it('does not show the landing view until called', function() {
      clTest.getView('landing-view').length.should.equal(0)
    })

    it('shows the landing page view when no other view set', function() {
      return cl.showView('#foobar').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the hash ID is empty', function() {
      return cl.showView('').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the ID is a hash only', function() {
      // This normally won't happen, since window.location.hash will return the
      // empty string if only '#' is present.
      return cl.showView('#').then(function() {
        clTest.getView('landing-view').length.should.equal(1)
      })
    })

    it('doesn\'t change the view when the hash ID is unknown', function() {
      return cl.showView('#')
        .then(function() {
          return cl.showView('#foobar')
        })
        .then(function() {
          clTest.getView('landing-view').length.should.equal(1)
        })
    })

    it('passes the hash view parameter to the view function', function() {
      spyOn('landingView')
      return cl.showView('#-foo-bar').then(function() {
        cl.landingView.calledWith('foo-bar').should.be.true
      })
    })

    it('calls the done() callback if present', function() {
      var landingView = cl.landingView,
          doneSpy

      stubOut('landingView').callsFake(function() {
        return landingView().then(function(view) {
          doneSpy = sinon.spy(view, 'done')
          return view
        })
      })
      return cl.showView('#').then(function() {
        expect(doneSpy.calledOnce).to.be.true
      })
    })

    it('shows the landing view when the container isn\'t empty', function() {
      var container = document.getElementsByClassName('view-container')[0]
      container.children.length.should.equal(0)
      container.appendChild(document.createElement('p'))
      container.children.length.should.equal(1)

      return cl.showView('').then(function() {
        container.children.length.should.equal(1)
        clTest.getView('landing-view').length.should.equal(1)
      })
    })
  })

  describe('loadApp', function() {
    var invokeLoadApp

    beforeEach(function() {
      cl.xhr.withArgs('GET', '/id').returns(
        Promise.resolve({ response: 'mbland@acm.org' }))
    })

    invokeLoadApp = function() {
      var origHashChangeHandler = window.onhashchange

      return cl.loadApp().then(function() {
        var newHashChangeHandler = window.onhashchange
        window.onhashchange = origHashChangeHandler
        return newHashChangeHandler
      })
    }

    it('invokes the router when loaded', function() {
      spyOn('showView')
      return invokeLoadApp().then(function() {
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('subscribes to the hashchange event', function() {
      return invokeLoadApp().then(function(hashChangeHandler) {
        expect(typeof hashChangeHandler).to.equal('function')
        spyOn('showView')
        hashChangeHandler()
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('shows the nav bar', function() {
      return invokeLoadApp().then(function() {
        var hostPrefix = window.location.protocol + '//' + window.location.host,
            navBar,
            userId,
            navLinks

        navBar = document.getElementsByClassName('nav')[0]
        expect(navBar).to.not.be.undefined

        userId = navBar.querySelector('[id=userid]')
        expect(userId).to.not.be.undefined
        userId.textContent.should.equal('mbland@acm.org')

        navLinks = navBar.getElementsByTagName('A')
        navLinks.length.should.equal(2)
        navLinks[0].href.should.equal(hostPrefix + '/#')
        navLinks[1].href.should.equal(hostPrefix + '/logout')
      })
    })

    it('shows an unknown user marker on /id error', function() {
      cl.xhr.withArgs('GET', '/id').returns(
        Promise.reject({ status: 404, response: 'forced error' }))
      return invokeLoadApp().then(function() {
        document.getElementById('userid').textContent
          .should.equal('<unknown user>')
      })
    })
  })

  describe('getTemplate', function() {
    it('returns a new template element', function() {
      var original = document.getElementsByClassName('landing-view')[0],
          template = cl.getTemplate('landing-view')
      expect(original).to.not.be.undefined
      expect(template).to.not.be.undefined
      original.should.not.equal(template)
    })

    it('throws an error if passed an invalid template name', function() {
      expect(function() { cl.getTemplate('foobar') })
        .to.throw(Error, 'unknown template name: foobar')
    })
  })

  describe('landingView', function() {
    it('shows a form to create a URL redirection', function() {
      return cl.landingView().then(function(view) {
        var form = view.element.getElementsByTagName('form').item(0),
            labels = form.getElementsByTagName('label'),
            inputs = form.getElementsByTagName('input'),
            button = form.getElementsByTagName('button')[0],
            inputFocus

        expect(labels[0].textContent).to.eql('Custom link:')
        expect(inputs[0]).not.to.eql(null)
        expect(labels[1].textContent).to.eql('Redirect to:')
        expect(inputs[1]).not.to.eql(null)
        expect(button.textContent).to.contain('Create URL')

        inputFocus = sinon.stub(inputs[0], 'focus')
        view.done()
        expect(inputFocus.calledOnce).to.be.true
      })
    })
  })

  describe('applyData', function() {
    it('applies an object\'s properties to a template', function() {
      var data = {
            url: '/foo',
            location: REDIRECT_LOCATION,
            submit: 'Create URL'
          },
          form = cl.getTemplate('edit-link'),
          fields = form.getElementsByTagName('input'),
          url = fields[0],
          location = fields[1],
          button = form.getElementsByTagName('button')[0]

      expect(cl.applyData(data, form)).to.equal(form)
      expect(url.defaultValue).to.equal('/foo')
      expect(location.defaultValue).to.equal(REDIRECT_LOCATION)
      expect(button.textContent).to.equal('Create URL')
    })
  })

  describe('fade', function() {
    var element, setTimeoutStub

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      setTimeoutStub = sinon.stub(window, 'setTimeout')
      setTimeoutStub.callsFake(function(func) {
        func()
      })
    })

    afterEach(function() {
      setTimeoutStub.restore()
      clTest.removeElement(element)
    })

    it('fades out an element', function() {
      element.style.opacity = 1
      return cl.fade(element, -0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(0)
          expect(setTimeoutStub.callCount).to.equal(10)
        })
    })

    it('fades in an element', function() {
      element.style.opacity = 0
      return cl.fade(element, 0.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(setTimeoutStub.callCount).to.equal(10)
        })
    })

    it('handles increments < -1', function() {
      element.style.opacity = 1
      return cl.fade(element, -1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(0)
        })
    })

    it('handles increments > 1', function() {
      element.style.opacity = 0
      return cl.fade(element, 1.1, 10).should.be.fulfilled
        .then(function(elem) {
          expect(parseInt(elem.style.opacity)).to.equal(1)
        })
    })

    it('throws an error for increments that aren\'t numbers', function() {
      expect(function() { cl.fade(null, 'foobar') })
        .to.throw(Error, 'increment must be a nonzero number: foobar')
    })

    it('throws an error for increments === 0', function() {
      expect(function() { cl.fade(null, 0.0) })
        .to.throw(Error, 'increment must be a nonzero number: 0')
    })

    it('throws an error for deadlines that aren\'t numbers', function() {
      expect(function() { cl.fade(null, -0.05) })
        .to.throw(Error, 'deadline must be a positive number: undefined')
    })

    it('throws an error for deadlines <= 0', function() {
      expect(function() { cl.fade(null, -0.05, 0) })
        .to.throw(Error, 'deadline must be a positive number: 0')
    })
  })

  describe('flashElement', function() {
    var element

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      element.style.opacity = 1
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('fades an element out, updates its text, and fades it back', function() {
      var replacement = '<p>Goodbye, World!</p>'

      stubOut('fade')
      cl.fade.callsFake(function(element) {
        return Promise.resolve(element)
      })
      element.innerHTML = '<p>Hello, World!</p>'

      return cl.flashElement(element, replacement).should.be.fulfilled
        .then(function(elem) {
          expect(elem).to.equal(element)
          expect(cl.fade.calledTwice).to.be.true
          expect(parseInt(elem.style.opacity)).to.equal(1)
          expect(elem.innerHTML).to.equal(replacement)
        })
    })
  })

  describe('createAnchor', function() {
    it('creates a new anchor using the URL as the anchor text', function() {
      var anchor = cl.createAnchor('https://example.com')
      anchor.href.should.equal('https://example.com/')
      anchor.textContent.should.equal('https://example.com')
    })

    it('creates a new anchor using the supplied anchor text', function() {
      var anchor = cl.createAnchor('https://example.com', 'test link')
      anchor.href.should.equal('https://example.com/')
      anchor.textContent.should.equal('test link')
    })
  })

  describe('focusFirstElement', function() {
    var element,
        firstAnchor,
        secondAnchor

    beforeEach(function() {
      element = clTest.createVisibleElement('div')
      firstAnchor = cl.createAnchor('https://example.com/', 'first')
      element.appendChild(firstAnchor)
      secondAnchor = cl.createAnchor('https://example.com/', 'second')
      element.appendChild(secondAnchor)
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('does nothing if no matching tag exists', function() {
      cl.focusFirstElement(element, 'input')
      document.activeElement.should.not.equal(firstAnchor)
      document.activeElement.should.not.equal(secondAnchor)
    })

    it('matches first anchor', function() {
      cl.focusFirstElement(element, 'a')
      document.activeElement.should.equal(firstAnchor)
      document.activeElement.should.not.equal(secondAnchor)
    })
  })

  describe('createLink', function() {
    var linkForm, expectXhr,
        resultUrl = window.location.origin + '/foo',
        resultAnchor = '<a href=\'/foo\'>' + resultUrl + '</a>'

    beforeEach(function() {
      linkForm = cl.getTemplate('edit-link')
      linkForm.querySelector('[data-name=url]').value = 'foo'
      linkForm.querySelector('[data-name=location]').value = REDIRECT_LOCATION
    })

    expectXhr = function() {
      var payload = { location: REDIRECT_LOCATION }
      return cl.xhr.withArgs('POST', '/api/create/foo', payload)
    }

    it('creates a link that doesn\'t already exist', function() {
      expectXhr().returns(Promise.resolve())
      return cl.createLink(linkForm).should.become(
        resultAnchor + ' now redirects to ' + REDIRECT_LOCATION)
    })

    it('fails to create a link that already exists', function() {
      expectXhr().callsFake(function() {
        return Promise.reject({
          status: 403,
          response: { err: '/foo already exists' }
        })
      })

      return cl.createLink(linkForm)
        .should.be.rejectedWith(new RegExp(resultAnchor + ' already exists'))
    })

    it('strips leading slashes from the link name', function() {
      var payload = { location: REDIRECT_LOCATION }
      cl.xhr.withArgs('POST', '/api/create/foo', payload)
        .returns(Promise.resolve())

      linkForm.querySelector('[data-name=url]').value = '///foo'
      return cl.createLink(linkForm).should.become(
        resultAnchor + ' now redirects to ' + REDIRECT_LOCATION)
    })

    it('throws an error if the custom link field is missing', function() {
      var urlField = linkForm.querySelector('[data-name=url]')
      urlField.parentNode.removeChild(urlField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('throws an error if the redirect location field is missing', function() {
      var locationField = linkForm.querySelector('[data-name=location]')
      locationField.parentNode.removeChild(locationField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('rejects if the custom link value is missing', function() {
      linkForm.querySelector('[data-name=url]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Custom link field must not be empty.')
    })

    it('rejects if the redirect location value is missing', function() {
      linkForm.querySelector('[data-name=location]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Redirect location field must not be empty.')
    })

    it('rejects if the location has an incorrect protocol', function() {
      linkForm.querySelector('[data-name=location]').value = 'gopher://bar'
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Redirect location protocol must be http:// or https://.')
    })

    it('rejects if the request returns a server error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject({ status: 500 })
      })
      return cl.createLink(linkForm).should.be.rejectedWith(
        new RegExp('server error .* ' + resultUrl.replace('/', '\\/') +
          ' wasn\'t created'))
    })

    it('rejects if the request raises a network error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject(new Error('A network error occurred.'))
      })
      return cl.createLink(linkForm)
        .should.be.rejectedWith('A network error occurred.')
    })

    it('rejects if the request raises another error', function() {
      expectXhr().callsFake(function() {
        return Promise.reject('forced error')
      })
      return cl.createLink(linkForm).should.be.rejectedWith('forced error')
    })

    it('rejects when the server response doesn\'t contain JSON', function() {
      // This models what happens when trying to POST to the local test server
      // instead of the actual application backend.
      expectXhr().callsFake(function() {
        return Promise.reject({
          status: 405,
          statusText: 'Method not allowed'
        })
      })
      return cl.createLink(linkForm)
        .should.be.rejectedWith('Could not create ' + resultUrl +
          ': Method not allowed')
    })
  })

  describe('createLinkClick', function() {
    var view, button, result

    beforeEach(function() {
      return cl.showView('#').then(function() {
        view = clTest.getView('landing-view')[0]
        button = view.getElementsByTagName('button')[0]
        result = view.getElementsByClassName('result')[0]

        // Attach the view to the body to make it visible; needed to test
        // focus/document.activeElement.
        document.body.appendChild(view)

        // Stub cl.fade() instead of cl.flashElement() because we depend upon
        // the result's innerHTML to be set by the latter.
        stubOut('fade').callsFake(function(element, increment) {
          element.style.opacity = increment < 0.0 ? 0 : 1
          return Promise.resolve(element)
        })
      })
    })

    afterEach(function() {
      view.parentNode.removeChild(view)
    })

    it('flashes on success', function() {
      stubOut('createLink')
        .returns(Promise.resolve('<a href="/foo">success</a>'))
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var successDiv = result.getElementsByClassName('success')[0],
            anchor
        expect(successDiv).to.not.be.undefined
        successDiv.textContent.should.equal('success')
        anchor = successDiv.getElementsByTagName('A')[0]
        expect(anchor).to.not.be.undefined
        anchor.should.equal(document.activeElement)
      })
    })

    it('flashes on failure', function() {
      stubOut('createLink').callsFake(function() {
        return Promise.reject('forced failure')
      })
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var failureDiv = result.getElementsByClassName('failure')[0]
        expect(failureDiv).to.not.be.undefined
        failureDiv.textContent.should.equal('forced failure')
      })
    })

    it('flashes on error', function() {
      stubOut('createLink').callsFake(function() {
        return Promise.reject(new Error('forced error'))
      })
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var failureDiv = result.getElementsByClassName('failure')[0]
        expect(failureDiv).to.not.be.undefined
        failureDiv.textContent.should.equal('forced error')
      })
    })
  })
})

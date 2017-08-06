/* eslint-env browser, mocha */
/* global expect, sinon */
'use strict'

describe('Custom Links', function() {
  var cl = window.cl,
      clTest = window.clTest,
      spyOn,
      stubOut,
      doubles = [],
      viewElementReceivesFocus,
      prepareFlashingElement,
      useFakeFade,
      USER_ID = 'mbland@acm.org',
      LINK_TARGET = 'https://mike-bland.com/'

  beforeEach(function() {
    cl.userId = USER_ID
    stubOut(cl.backend, 'getUserInfo')
    cl.backend.getUserInfo.returns(Promise.resolve({ links: [] }))
  })

  afterEach(function() {
    doubles.forEach(function(double) {
      double.restore()
    })
  })

  spyOn = function(obj, functionName) {
    var spy = sinon.spy(obj, functionName)
    doubles.push(spy)
    return spy
  }

  stubOut = function(obj, functionName) {
    var stub = sinon.stub(obj, functionName)
    doubles.push(stub)
    return stub
  }

  viewElementReceivesFocus = function(view, element) {
    var inputFocus = sinon.stub(element, 'focus')
    view.done()
    return inputFocus.calledOnce
  }

  prepareFlashingElement = function(element) {
    // Attach the element to the body to make it visible; needed to test
    // focus/document.activeElement.
    document.body.appendChild(element)
    useFakeFade()
    return element
  }

  // Stub cl.fade() instead of cl.flashElement() because we depend upon the
  // result's innerHTML to be set by the latter.
  useFakeFade = function() {
    stubOut(cl, 'fade').callsFake(function(element, increment) {
      element.style.opacity = increment < 0.0 ? 0 : 1
      return Promise.resolve(element)
    })
  }

  describe('showView', function() {
    it('does not show any view until called', function() {
      clTest.getView('links-view').length.should.equal(0)
    })

    it('shows the landing page view when no other view set', function() {
      return cl.showView('#foobar').then(function() {
        clTest.getView('links-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the hash ID is empty', function() {
      return cl.showView('').then(function() {
        clTest.getView('links-view').length.should.equal(1)
      })
    })

    it('shows the landing page view when the ID is a hash only', function() {
      // This normally won't happen, since window.location.hash will return the
      // empty string if only '#' is present.
      return cl.showView('#').then(function() {
        clTest.getView('links-view').length.should.equal(1)
      })
    })

    it('doesn\'t change the view when the hash ID is unknown', function() {
      return cl.showView('#')
        .then(function() {
          return cl.showView('#foobar')
        })
        .then(function() {
          clTest.getView('links-view').length.should.equal(1)
        })
    })

    it('passes the hash view parameter to the view function', function() {
      spyOn(cl, 'createLinkView')
      return cl.showView('#create-/foo').then(function() {
        cl.createLinkView.calledWith('/foo').should.be.true
      })
    })

    it('calls the done() callback if present', function() {
      var createLinkView = cl.createLinkView,
          doneSpy

      stubOut(cl, 'createLinkView').callsFake(function() {
        return createLinkView().then(function(view) {
          doneSpy = sinon.spy(view, 'done')
          return view
        })
      })
      return cl.showView('#create').then(function() {
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
        clTest.getView('links-view').length.should.equal(1)
      })
    })

    it('logs to console.error without changing the view on error', function() {
      var err = new Error('forced error')

      stubOut(console, 'error')
      stubOut(cl, 'createLinkView')
      cl.createLinkView.withArgs('/foo').returns(Promise.reject(err))

      return cl.showView('#')
        .then(function() {
          return cl.showView('#create-/foo')
        })
        .then(function() {
          clTest.getView('links-view').length.should.equal(1)
          console.error.calledWith('View not updated for #create-/foo:', err)
            .should.be.true
        })
    })
  })

  describe('Backend', function() {
    var backend, xhr, checkMakeApiCallArgs

    beforeEach(function() {
      xhr = sinon.stub()
      backend = new cl.Backend(xhr)
    })

    checkMakeApiCallArgs = function(method, endpoint, link, params, ok, err) {
      var args = backend.makeApiCall.args[0]

      args[0].should.equal(method)
      args[1].should.equal(endpoint)
      args[2].should.eql(cl.createLinkInfo(link))
      // The params and okMsg arguments may be undefined, hence expect instead
      // of should.
      expect(args[3]).to.eql(params)
      expect(args[4]).to.eql(ok)
      args[5].should.equal(err)
    }

    describe('getLoggedInUserId', function() {
      it('returns the user ID from a successful response', function() {
        xhr.withArgs('GET', '/id').returns(
          Promise.resolve({ response: USER_ID }))
        return backend.getLoggedInUserId().should.become(USER_ID)
      })

      it('returns cl.UNKNOWN_USER if the request fails', function() {
        xhr.withArgs('GET', '/id').returns(Promise.reject())
        return backend.getLoggedInUserId().should.become(cl.UNKNOWN_USER)
      })
    })

    describe('makeApiCall', function() {
      var makeApiCall = function(response) {
        xhr.withArgs('POST', '/api/create/foo', { target: LINK_TARGET })
          .returns(response)
        return backend.makeApiCall('POST', 'create', cl.createLinkInfo('foo'),
          { target: LINK_TARGET }, '/foo created', '/foo failed')
      }

      it('returns a success message on success', function() {
        return makeApiCall(Promise.resolve({})).should.become('/foo created')
      })

      it('returns the response on success', function() {
        var response = {
          foo: 'bar'
        }
        return makeApiCall(Promise.resolve({ response: response }))
          .should.become(response)
      })

      it('rejects with an error without the XHR', function() {
        return makeApiCall(Promise.reject(new Error('simulated error')))
          .should.be.rejectedWith(Error, '/foo failed: simulated error')
          .then(function(err) {
            expect(err.xhr).to.be.undefined
          })
      })

      it('rejects with an error including the XHR', function() {
        var xhr = {
          status: 403,
          statusText: 'Forbidden'
        }
        return makeApiCall(Promise.reject(xhr))
          .should.be.rejectedWith(Error, '/foo failed: Forbidden')
          .then(function(err) {
            expect(err.xhr).to.equal(xhr)
          })
      })
    })

    describe('getUserInfo', function() {
      beforeEach(function() {
        stubOut(console, 'error')
      })

      it('returns user info from a successful response', function() {
        var usersLinks = [
            { link: '/foo', target: 'https://foo.com/', clicks: 1 },
            { link: '/bar', target: 'https://bar.com/', clicks: 2 },
            { link: '/baz', target: 'https://baz.com/', clicks: 3 }
        ]

        xhr.withArgs('GET', '/api/user/' + USER_ID).returns(
          Promise.resolve({ response: { links: usersLinks } }))
        return backend.getUserInfo(USER_ID).should.become({ links: usersLinks })
      })

      it('returns an empty response for cl.UNKNOWN_USER', function() {
        return backend.getUserInfo(cl.UNKNOWN_USER).should.become({})
      })

      it('rejects with an error message', function() {
        xhr.withArgs('GET', '/api/user/' + USER_ID).returns(
          Promise.reject(new Error('simulated error')))
        return backend.getUserInfo(USER_ID).should.be.rejectedWith(
          'Request for user info failed: simulated error')
      })

      it('rejects with status text', function() {
        xhr.withArgs('GET', '/api/user/' + USER_ID).returns(
          Promise.reject({ statusText: 'Forbidden' }))
        return backend.getUserInfo(USER_ID).should.be.rejectedWith(
          'Request for user info failed: Forbidden')
      })
    })

    describe('createLink', function() {
      it('calls /api/create', function() {
        stubOut(backend, 'makeApiCall')
        backend.createLink('foo', LINK_TARGET)
        backend.makeApiCall.calledOnce.should.be.true
        checkMakeApiCallArgs('POST', 'create', 'foo', { target: LINK_TARGET },
          '<a href=\'/foo\'>' +  window.location.origin +
            '/foo</a> now redirects to ' + LINK_TARGET,
          'The link wasn\'t created')
      })
    })

    describe('deleteLink', function() {
      it('calls /api/delete', function() {
        stubOut(backend, 'makeApiCall')
        backend.deleteLink('foo')
        backend.makeApiCall.calledOnce.should.be.true
        checkMakeApiCallArgs('DELETE', 'delete', 'foo', undefined,
          '/foo has been deleted', '/foo wasn\'t deleted')
      })
    })

    describe('getLink', function() {
      it('calls /api/info', function() {
        stubOut(backend, 'makeApiCall')
        backend.getLink('foo')
        backend.makeApiCall.calledOnce.should.be.true
        checkMakeApiCallArgs('GET', 'info', 'foo', undefined, undefined,
          'Failed to get link info for /foo')
      })
    })
  })

  describe('loadApp', function() {
    var invokeLoadApp

    beforeEach(function() {
      cl.userId = undefined
      stubOut(cl.backend, 'getLoggedInUserId')
      cl.backend.getLoggedInUserId.returns(Promise.resolve(USER_ID))
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
      spyOn(cl, 'showView')
      return invokeLoadApp().then(function() {
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('subscribes to the hashchange event', function() {
      return invokeLoadApp().then(function(hashChangeHandler) {
        expect(typeof hashChangeHandler).to.equal('function')
        spyOn(cl, 'showView')
        hashChangeHandler()
        cl.showView.calledWith(window.location.hash).should.be.true
      })
    })

    it('sets the logged in user ID', function() {
      return invokeLoadApp().then(function() {
        cl.userId.should.equal(USER_ID)
      })
    })

    it('shows the nav bar', function() {
      return invokeLoadApp().then(function() {
        var navBar,
            userId,
            navLinks

        navBar = document.getElementsByClassName('nav')[0]
        expect(navBar).to.not.be.undefined

        userId = navBar.querySelector('[id=userid]')
        expect(userId).to.not.be.undefined
        userId.textContent.should.equal(USER_ID)

        navLinks = navBar.getElementsByTagName('A')
        navLinks.length.should.equal(3)
        navLinks[0].href.should.equal(window.location.origin + '/#')
        navLinks[1].href.should.equal(window.location.origin + '/#create')
        navLinks[2].href.should.equal(window.location.origin + '/logout')
      })
    })
  })

  describe('getTemplate', function() {
    it('returns a new template element', function() {
      var original = document.getElementsByClassName('create-view')[0],
          template = cl.getTemplate('create-view')
      expect(original).to.not.be.undefined
      expect(template).to.not.be.undefined
      original.should.not.equal(template)
    })

    it('throws an error if passed an invalid template name', function() {
      expect(function() { cl.getTemplate('foobar') })
        .to.throw(Error, 'unknown template name: foobar')
    })
  })

  describe('createLinkView', function() {
    it('shows a form to create a custom link', function() {
      return cl.createLinkView().then(function(view) {
        var form = view.element,
            labels = form.getElementsByTagName('label'),
            inputs = form.getElementsByTagName('input'),
            button = form.getElementsByTagName('button')[0]

        expect(labels[0].textContent).to.eql('Custom link:')
        expect(inputs[0]).not.to.eql(null)
        expect(labels[1].textContent).to.eql('Target URL:')
        expect(inputs[1]).not.to.eql(null)
        expect(button.textContent).to.contain('Create link')
        expect(button.onclick).to.equal(cl.createLinkClick)
        expect(viewElementReceivesFocus(view, inputs[0])).to.equal(true)
      })
    })

    it('fills in the link field when passed a hash view parameter', function() {
      return cl.createLinkView('/foo').then(function(view) {
        var inputs = view.element.getElementsByTagName('input')

        expect(inputs[0]).not.to.eql(null)
        inputs[0].defaultValue.should.equal('foo')
        expect(viewElementReceivesFocus(view, inputs[1])).to.equal(true)
      })
    })
  })

  describe('applyData', function() {
    it('applies an object\'s properties to a template', function() {
      var data = {
            link: '/foo',
            target: LINK_TARGET
          },
          form = cl.getTemplate('create-view'),
          fields = form.getElementsByTagName('input'),
          link = fields[0],
          target = fields[1]

      expect(cl.applyData(data, form)).to.equal(form)
      expect(link.defaultValue).to.equal('/foo')
      expect(target.defaultValue).to.equal(LINK_TARGET)
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

      stubOut(cl, 'fade')
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

  describe('createLinkInfo', function() {
    it('returns an object with the relative URL, full URL, anchor', function() {
      var full = window.location.origin + '/foo',
          result = cl.createLinkInfo('foo')
      result.trimmed.should.equal('foo')
      result.relative.should.equal('/foo')
      result.full.should.equal(full)
      result.anchor.should.equal('<a href=\'/foo\'>' + full + '</a>')
    })

    it('handles a link that already has leading slashes', function() {
      var full = window.location.origin + '/foo',
          result = cl.createLinkInfo('///foo')
      result.trimmed.should.equal('foo')
      result.relative.should.equal('/foo')
      result.full.should.equal(full)
      result.anchor.should.equal('<a href=\'/foo\'>' + full + '</a>')
    })

    it('handles an undefined link as the root URL', function() {
      var full = window.location.origin + '/',
          result = cl.createLinkInfo()
      result.trimmed.should.equal('')
      result.relative.should.equal('/')
      result.full.should.equal(full)
      result.anchor.should.equal('<a href=\'/\'>' + full + '</a>')
    })
  })

  describe('apiErrorMessage', function() {
    var xhr, linkInfo, prefix

    beforeEach(function() {
      xhr = {
        status: 403,
        statusText: 'Permission denied'
      }
      linkInfo = cl.createLinkInfo('foo')
      prefix = 'The operation failed'
    })

    it('uses the Error message', function() {
      delete xhr.status
      expect(cl.apiErrorMessage(new Error('Error!'), linkInfo, prefix))
        .to.equal('The operation failed: Error!')
    })

    it('returns the error string as-is', function() {
      delete xhr.status
      expect(cl.apiErrorMessage('plain string', linkInfo, prefix))
        .to.equal('The operation failed: plain string')
    })

    it('returns a server error message', function() {
      xhr.status = 500
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.match(/The operation failed: A server error occurred\./)
    })

    it('returns response text with the link replaced by an anchor', function() {
      xhr.response = { err: 'Could not do stuff with /foo.' }
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.equal('The operation failed: ' +
          'Could not do stuff with ' + linkInfo.anchor + '.')
    })

    it('returns the failure message and the statusText', function() {
      expect(cl.apiErrorMessage(xhr, linkInfo, prefix))
        .to.equal('The operation failed: Permission denied')
    })
  })

  describe('confirmDelete', function() {
    var dialog, resultElement, linksView

    beforeEach(function() {
      stubOut(cl.backend, 'deleteLink')
      resultElement = prepareFlashingElement(document.createElement('div'))
      linksView = new cl.View(cl.getTemplate('links-view'), function() { })
      linksView.numLinks = 1
      linksView.updateNumLinks = sinon.spy()
      dialog = cl.confirmDelete('/foo', resultElement, linksView)
      dialog.open()
    })

    afterEach(function() {
      dialog.close()
      clTest.removeElement(resultElement)
    })

    it('opens a dialog box to delete the specified link', function() {
      dialog.element.parentNode.should.equal(document.body)
      cl.backend.deleteLink.withArgs('/foo').returns(Promise.resolve('deleted'))
      dialog.confirm.click()
      return dialog.operation.then(function() {
        cl.backend.deleteLink.called.should.be.true
        resultElement.textContent.should.equal('deleted')
        linksView.updateNumLinks.withArgs(-1).calledOnce.should.be.true
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
    var linkForm, expectBackendCall

    beforeEach(function() {
      stubOut(cl.backend, 'createLink')
      linkForm = cl.getTemplate('create-view')
      linkForm.querySelector('[data-name=link]').value = 'foo'
      linkForm.querySelector('[data-name=target]').value = LINK_TARGET
    })

    expectBackendCall = function() {
      return cl.backend.createLink.withArgs('foo', LINK_TARGET)
    }

    it('creates a link from valid form data', function() {
      expectBackendCall().returns(Promise.resolve('backend call succeeded'))
      return cl.createLink(linkForm).should.become('backend call succeeded')
    })

    it('fails to create a link from valid form data', function() {
      expectBackendCall().returns(Promise.reject('backend call failed'))
      return cl.createLink(linkForm)
        .should.be.rejectedWith('backend call failed')
    })

    it('strips leading slashes from the link name', function() {
      expectBackendCall().returns(Promise.resolve('backend call succeeded'))
      linkForm.querySelector('[data-name=link]').value = '///foo'
      return cl.createLink(linkForm).should.become('backend call succeeded')
    })

    it('throws an error if the custom link field is missing', function() {
      var linkField = linkForm.querySelector('[data-name=link]')
      linkField.parentNode.removeChild(linkField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('throws an error if the target URL field is missing', function() {
      var targetField = linkForm.querySelector('[data-name=target]')
      targetField.parentNode.removeChild(targetField)
      expect(function() { cl.createLink(linkForm) }).to.throw(Error,
        'fields missing from link form: ' + linkForm.outerHTML)
    })

    it('rejects if the custom link value is missing', function() {
      linkForm.querySelector('[data-name=link]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Custom link field must not be empty.')
    })

    it('rejects if the target URL value is missing', function() {
      linkForm.querySelector('[data-name=target]').value = ''
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Target URL field must not be empty.')
    })

    it('rejects if the target URL has an incorrect protocol', function() {
      linkForm.querySelector('[data-name=target]').value = 'gopher://bar'
      return cl.createLink(linkForm).should.be.rejectedWith(
        'Target URL protocol must be http:// or https://.')
    })
  })

  describe('flashResult', function() {
    var element

    beforeEach(function() {
      element = prepareFlashingElement(document.createElement('div'))
    })

    afterEach(function() {
      clTest.removeElement(element)
    })

    it('flashes a success message', function() {
      return cl.flashResult(element, Promise.resolve('Success!'))
        .then(function() {
          element.textContent.should.equal('Success!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result success')
        })
    })

    it('flashes a failure message', function() {
      return cl.flashResult(element, Promise.reject('Failure!'))
        .then(function() {
          element.textContent.should.equal('Failure!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result failure')
        })
    })

    it('flashes a failure message on Error', function() {
      return cl.flashResult(element, Promise.reject(new Error('Error!')))
        .then(function() {
          element.textContent.should.equal('Error!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result failure')
        })
    })

    it('focuses the first anchor if present', function() {
      var anchor = '<a href="#">Click me!</a>'
      return cl.flashResult(element, Promise.resolve(anchor))
        .then(function() {
          element.textContent.should.equal('Click me!')
          expect(element.children[0]).to.not.be.undefined
          element.children[0].className.should.equal('result success')
          expect(element.children[0].getElementsByTagName('a')[0])
            .to.equal(document.activeElement)
        })
    })
  })

  describe('createLinkClick', function() {
    var view, button, result

    beforeEach(function() {
      return cl.showView('#create').then(function() {
        view = prepareFlashingElement(clTest.getView('create-view')[0])
        button = view.getElementsByTagName('button')[0]
        result = view.getElementsByClassName('result')[0]
      })
    })

    afterEach(function() {
      view.parentNode.removeChild(view)
    })

    it('flashes result after API call', function() {
      stubOut(cl, 'createLink')
        .returns(Promise.resolve('<a href="/foo">success</a>'))
      button.click()
      return result.done.should.be.fulfilled.then(function() {
        var successDiv = result.getElementsByClassName('success')[0]
        expect(successDiv).to.not.be.undefined
        successDiv.textContent.should.equal('success')
        expect(successDiv.getElementsByTagName('A')[0])
          .to.equal(document.activeElement)
      })
    })
  })

  describe('setLocationHref', function() {
    it('sets the window.location.href attribute', function() {
      var fakeWindow = { location: { href: null } }
      cl.setLocationHref(fakeWindow, '#edit-/foo')
      fakeWindow.location.href.should.equal('#edit-/foo')
    })
  })

  describe('dateStamp', function() {
    it('returns a properly formatted locale date string', function() {
      var date = new Date
      cl.dateStamp(date.getTime() + '').should.equal(
        date.toLocaleString().replace(/, /, ' '))
    })

    it('returns a default date string if timestamp undefined', function() {
      var date = new Date(0)
      cl.dateStamp().should.equal(date.toLocaleString().replace(/, /, ' '))
    })
  })

  describe('createLinksTable', function() {
    var linksView

    beforeEach(function() {
      linksView = new cl.View(cl.getTemplate('links-view'), function() { })
    })

    it('returns an empty table if no links', function() {
      var table = cl.createLinksTable([]),
          header = table.children[0]

      table.children.length.should.equal(1)
      header.className.split(' ').indexOf('links-header').should.not.equal(-1)
    })

    it('returns a table with a single element', function() {
      var links = [{
            link: '/foo',
            target: 'https://foo.com/',
            created: '0987654321',
            updated: '1234567890',
            clicks: 3
          }],
          table = cl.createLinksTable(links, linksView),
          linkRow = table.children[1],
          anchors,
          timestamps,
          buttons,
          linkTarget,
          clicksAction

      table.children.length.should.equal(2)
      linkTarget = linkRow.children[0]
      anchors = linkTarget.getElementsByTagName('a')
      anchors.length.should.equal(2)
      anchors[0].textContent.should.equal('/foo')
      anchors[0].href.should.equal(window.location.origin + '/foo')
      anchors[1].textContent.should.equal('https://foo.com/')
      anchors[1].href.should.equal('https://foo.com/')

      timestamps = linkTarget.getElementsByClassName('timestamp')
      timestamps.length.should.equal(2)
      timestamps[0].textContent.should.equal(cl.dateStamp('0987654321'))
      timestamps[1].textContent.should.equal(cl.dateStamp('1234567890'))

      clicksAction = linkRow.children[1]
      clicksAction.children.length.should.equal(2)
      clicksAction.children[0].textContent.should.equal('3')
      buttons = clicksAction.children[1].getElementsByTagName('button')
      buttons.length.should.equal(2)

      buttons[0].textContent.should.equal('Edit')
      buttons[1].textContent.should.equal('Delete')
    })

    it('changes to the edit page when the edit button is clicked', function() {
      var links = [{ link: '/foo', target: 'https://foo.com/', count: 3 }],
          table = cl.createLinksTable(links, linksView),
          row = table.getElementsByClassName('link')[0],
          editButton = row.getElementsByTagName('button')[0]

      stubOut(cl, 'setLocationHref')
      editButton.click()
      cl.setLocationHref.calledWith(window, '#edit-/foo').should.be.true
    })

    it('launches a dialog box to confirm deletion', function() {
      var links = [{ link: '/foo', target: 'https://foo.com/', clicks: 3 }],
          table = cl.createLinksTable(links, linksView),
          row = table.getElementsByClassName('link')[0],
          deleteButton = row.getElementsByTagName('button')[1],
          openSpy = sinon.spy()

      stubOut(cl, 'confirmDelete')
      cl.confirmDelete.withArgs('/foo').returns({ open: openSpy })
      deleteButton.click()
      cl.confirmDelete.called.should.be.true
      cl.confirmDelete.args[0][0].should.equal('/foo')
      cl.confirmDelete.args[0][1].should.not.be.null
      cl.confirmDelete.args[0][2].should.equal(linksView)
      openSpy.called.should.be.true
    })

    it('returns a table of multiple elements sorted by link', function() {
      var links =[
            { link: '/foo', target: 'https://foo.com/', clicks: 1 },
            { link: '/bar', target: 'https://bar.com/', clicks: 2 },
            { link: '/baz', target: 'https://baz.com/', clicks: 3 }
          ],
          table = cl.createLinksTable(links, linksView),
          rows = table.getElementsByClassName('link')

      rows.length.should.equal(links.length)
      rows[0].getElementsByTagName('a')[0].textContent.should.equal('/bar')
      rows[1].getElementsByTagName('a')[0].textContent.should.equal('/baz')
      rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
    })

    it('returns a table of multiple elements sorted by clicks', function() {
      var links = [
              { link: '/foo', target: 'https://foo.com/', clicks: 1 },
              { link: '/bar', target: 'https://bar.com/', clicks: 2 },
              { link: '/baz', target: 'https://baz.com/', clicks: 3 }
          ],
          tableOptions = { sortKey: 'clicks', order: 'descending' },
          table = cl.createLinksTable(links, linksView, tableOptions),
          rows = table.getElementsByClassName('link')

      rows.length.should.equal(links.length)
      rows[0].getElementsByTagName('a')[0].textContent.should.equal('/baz')
      rows[1].getElementsByTagName('a')[0].textContent.should.equal('/bar')
      rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
    })

    it('raises an error for a bad sort order option', function() {
      expect(function() { cl.createLinksTable([], null, { order: 'bogus' }) })
        .to.throw(Error, 'invalid sort order: bogus')
    })
  })

  describe('linksView', function() {
    var setApiResponseLinks

    setApiResponseLinks = function(links) {
      cl.backend.getUserInfo.withArgs(USER_ID)
        .returns(Promise.resolve({ links: links }))
    }

    it('shows no links for a valid user', function() {
      setApiResponseLinks([])
      return cl.linksView().then(function(view) {
        var noLinksNotice = view.element.getElementsByClassName('no-links')[0],
            newLinkAnchor

        expect(noLinksNotice).to.not.be.undefined
        newLinkAnchor = noLinksNotice.getElementsByTagName('a')[0]
        expect(newLinkAnchor).to.not.be.undefined
        viewElementReceivesFocus(view, newLinkAnchor).should.equal(true)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('')
      })
    })

    it('shows no links for cl.UNKNOWN_USER', function() {
      cl.userId = cl.UNKNOWN_USER
      cl.backend.getUserInfo.callThrough()
      return cl.linksView().then(function(view) {
        expect(view.element.getElementsByClassName('no-links')[0])
          .to.not.be.undefined
      })
    })

    it('shows a single link', function() {
      setApiResponseLinks([
        { link: '/foo', target: 'https://foo.com/', clicks: 1 }
      ])
      return cl.linksView().then(function(view) {
        var linksTable = view.element.getElementsByClassName('links')[0],
            rows,
            firstLink

        expect(linksTable).to.not.be.undefined
        rows = linksTable.getElementsByClassName('link')
        rows.length.should.equal(1)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('1 link')

        firstLink = rows[0].getElementsByTagName('a')[0]
        firstLink.textContent.should.equal('/foo')
        expect(viewElementReceivesFocus(view, firstLink)).to.equal(true)
      })
    })

    it('shows multiple links', function() {
      setApiResponseLinks([
        { link: '/foo', target: 'https://foo.com/', clicks: 1 },
        { link: '/bar', target: 'https://bar.com/', clicks: 2 },
        { link: '/baz', target: 'https://baz.com/', clicks: 3 }
      ])
      return cl.linksView().then(function(view) {
        var linksTable = view.element.getElementsByClassName('links')[0],
            rows,
            firstLink

        expect(linksTable).to.not.be.undefined
        rows = linksTable.getElementsByClassName('link')
        rows.length.should.equal(3)
        view.element.getElementsByClassName('total')[0].textContent
          .should.equal('3 links')

        firstLink = rows[0].getElementsByTagName('a')[0]
        firstLink.textContent.should.equal('/bar')
        expect(viewElementReceivesFocus(view, firstLink)).to.equal(true)

        rows[1].getElementsByTagName('a')[0].textContent.should.equal('/baz')
        rows[2].getElementsByTagName('a')[0].textContent.should.equal('/foo')
      })
    })

    it('shows an error message when the backend call fails', function() {
      cl.backend.getUserInfo.withArgs(USER_ID).returns(
        Promise.reject(new Error('simulated network error')))
      return cl.linksView().then(function(view) {
        var errorMsg = view.element.getElementsByClassName('result failure')[0]

        expect(errorMsg).to.not.be.undefined
        errorMsg.textContent.should.equal('simulated network error')
      })
    })
  })

  describe('Dialog', function() {
    var dialog, resultElement, errPrefix, addTemplate, testTemplate, event

    beforeEach(function() {
      stubOut(console, 'error')
      resultElement = prepareFlashingElement(document.createElement('div'))
      errPrefix = 'The "test-template" dialog box template '
      testTemplate = addTemplate('test-template', [
        '<div class=\'test-dialog dialog\'>',
        '  <h3 class=\'title\'>Confirm update</h3>',
        '  <p class=\'description\'>',
        '    Update <span data-name=\'link\'></span>?',
        '  </p>',
        '  <button class=\'confirm focused\'>OK</button>',
        '  <button class=\'cancel\'>Cancel</button>',
        '</div>'
      ].join('\n'))

      dialog = new cl.Dialog('test-template', { link: '/foo' }, function() {
        return Promise.resolve('operation done')
      }, resultElement)
      event = {
        keyCode: null,
        shiftKey: false,
        preventDefault: sinon.spy()
      }
    })

    afterEach(function() {
      clTest.removeElement(testTemplate)
      clTest.removeElement(resultElement)

      if (dialog !== undefined) {
        // This also demonstrates that dialog.close() is idempotent, since this
        // call won't crash after other test cases that also call it.
        dialog.close()
      }
    })

    addTemplate = function(name, innerHTML) {
      var template = document.createElement('div')

      template.className = name + ' dialog'
      template.innerHTML = innerHTML
      document.getElementsByClassName('templates')[0].appendChild(template)
      cl.templates = null
      return template
    }

    it('creates an object from a valid dialog box template', function() {
      var link

      expect(dialog.element).to.not.be.undefined
      expect(dialog.element.parentNode).to.be.null
      expect(dialog.previousFocus).to.equal(document.activeElement)

      link = dialog.element.querySelector(['[data-name=link]'])
      expect(link).to.not.be.undefined
      expect(link.textContent).to.equal('/foo')
    })

    it('throws if the template doesn\'t contain a title', function() {
      var title = testTemplate.getElementsByClassName('title')[0]

      clTest.removeElement(title)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a title element.')
    })

    it('throws if the template doesn\'t contain a description', function() {
      var description = testTemplate.getElementsByClassName('description')[0]

      clTest.removeElement(description)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a description element.')
    })

    it('throws if the given template doesn\'t contain buttons', function() {
      var buttons = testTemplate.getElementsByTagName('button')

      while (buttons[0]) {
        clTest.removeElement(buttons[0])
      }
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t contain buttons.')
    })

    it('throws if no focused element defined', function() {
      var focused = testTemplate.getElementsByClassName('focused')[0]

      clTest.removeElement(focused)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a focused element.')
    })

    it('throws if no confirm button is defined', function() {
      var confirm = testTemplate.getElementsByClassName('confirm')[0]

      // We only remove the 'confirm' class here.
      confirm.className = 'focused'
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a confirm button.')
    })

    it('throws if no cancel button is defined', function() {
      var cancel = testTemplate.getElementsByClassName('cancel')[0]

      clTest.removeElement(cancel)
      expect(function() { return new cl.Dialog('test-template') })
        .to.throw(errPrefix + 'doesn\'t define a cancel button.')
    })

    it('overrides confirm with cancel behavior for single button', function() {
      var confirm = testTemplate.getElementsByClassName('confirm')[0],
          cancel = testTemplate.getElementsByClassName('cancel')[0],
          operation = sinon.spy()

      clTest.removeElement(cancel)
      confirm.className += ' cancel'
      cancel = testTemplate.getElementsByClassName('cancel')[0]
      expect(cancel).to.equal(confirm)

      dialog = new cl.Dialog('test-template', {}, operation)
      spyOn(dialog, 'close')
      dialog.confirm.click()
      operation.called.should.be.false
      dialog.close.called.should.be.true
    })

    it('sets role and ARIA attributes on open', function() {
      expect(dialog.box.getAttribute('role')).to.be.null
      expect(dialog.box.getAttribute('aria-labelledby')).to.be.null
      expect(dialog.box.getAttribute('aria-describedby')).to.be.null
      expect(dialog.title.getAttribute('id')).to.be.null
      expect(dialog.description.getAttribute('id')).to.be.null

      dialog.open()
      expect(dialog.box.getAttribute('role')).to.equal('dialog')
      expect(dialog.box.getAttribute('aria-labelledby'))
        .to.equal('test-template-title')
      expect(dialog.box.getAttribute('aria-describedby'))
        .to.equal('test-template-description')
      expect(dialog.title.getAttribute('id'))
        .to.equal('test-template-title')
      expect(dialog.description.getAttribute('id'))
        .to.equal('test-template-description')
    })

    it('sets focus on open and restores focus on close', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.focused)
      expect(dialog.element.parentNode).to.equal(document.body)

      dialog.close()
      expect(document.activeElement).to.equal(dialog.previousFocus)
      expect(dialog.element.parentNode).to.be.null
    })

    it('performs the operation and closes the dialog on confirm', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      dialog.confirm.click()
      return dialog.operation.then(function() {
        expect(resultElement.textContent).to.equal('operation done')
        expect(dialog.element.parentNode).to.be.null
      })
    })

    it('closes the dialog when the cancel button is clicked', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      dialog.cancel.click()
      expect(resultElement.textContent).to.equal('')
      expect(dialog.element.parentNode).to.be.null
    })

    it('closes the dialog when the Escape key is pressed', function() {
      dialog.open()
      expect(dialog.element.parentNode).to.equal(document.body)
      event.keyCode = cl.KEY_ESC
      dialog.element.onkeydown(event)
      expect(dialog.element.parentNode).to.be.null
    })

    it('advances to the next button when Tab key is pressed', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.first)

      // Note that since KeyboardEvent isn't well-supported in most browsers, we
      // rely on checking that event.preventDefault() wasn't called, implying
      // that the keyboard focus proceeds normally.
      event.keyCode = cl.KEY_TAB
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.false
    })

    it('shifts focus from first to last button on Shift+Tab', function() {
      dialog.open()
      expect(document.activeElement).to.equal(dialog.first)
      event.keyCode = cl.KEY_TAB
      event.shiftKey = true
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.true
      expect(document.activeElement).to.equal(dialog.last)
    })

    it('shifts focus from last to first button on Tab', function() {
      dialog.open()
      dialog.last.focus()
      expect(document.activeElement).to.equal(dialog.last)
      event.keyCode = cl.KEY_TAB
      dialog.element.onkeydown(event)
      event.preventDefault.called.should.be.true
      expect(document.activeElement).to.equal(dialog.first)
    })

    describe('doOperation', function() {
      beforeEach(function() {
        dialog.open()
      })

      it('closes the dialog and flashes the result on success', function() {
        return dialog
          .doOperation(Promise.resolve('Success!'), resultElement)
          .then(function() {
            resultElement.textContent.should.equal('Success!')
            expect(resultElement.children[0]).to.not.be.undefined
            resultElement.children[0].className.should.equal('result success')
            expect(dialog.element.parentNode).to.be.null
          })
      })

      it('closes the dialog and flashes the result on failure', function() {
        return dialog
          .doOperation(Promise.reject('Failure!'), resultElement)
          .then(function() {
            resultElement.textContent.should.equal('Failure!')
            expect(resultElement.children[0]).to.not.be.undefined
            resultElement.children[0].className.should.equal('result failure')
            expect(dialog.element.parentNode).to.be.null
          })
      })
    })
  })

  describe('errorView', function() {
    var view, nav

    before(function() {
      stubOut(cl, 'flashElement')
      nav = clTest.fixture.getElementsByClassName('nav')[0]
      // We must take care to insert the nav node before all others.
      nav = document.body.insertBefore(nav.cloneNode(true),
        document.body.firstChild)

      view = cl.errorView('error message')
      view.done()
    })

    after(function() {
      clTest.removeElement(nav)
    })

    it('flashes the error message', function() {
      cl.flashElement.args[0].length.should.equal(2)
      cl.flashElement.args[0][0].tagName.should.equal('DIV')
      cl.flashElement.args[0][1].should.equal(
        '<div class="result failure">error message</div>')
    })

    it('focuses the first nav link', function() {
      document.activeElement.should.equal(nav.getElementsByTagName('a')[0])
    })
  })

  describe('editLinkView', function() {
    beforeEach(function() {
      stubOut(cl, 'setLocationHref')
      stubOut(cl.backend, 'getLink')
      useFakeFade()
    })

    describe('redirects to the "My links" view', function() {
      var errorMessage = 'no link parameter supplied'

      it('if no argument specified', function() {
        return cl.editLinkView().should.be.rejectedWith(Error, errorMessage)
          .then(function() {
            cl.setLocationHref.calledWith(window, '#').should.be.true
            cl.backend.getLink.called.should.be.false
          })
      })

      it('if the argument is empty', function() {
        return cl.editLinkView('').should.be.rejectedWith(Error, errorMessage)
          .then(function() {
            cl.setLocationHref.calledWith(window, '#').should.be.true
            cl.backend.getLink.called.should.be.false
          })
      })

      it('if the argument is only a slash', function() {
        return cl.editLinkView('/').should.be.rejectedWith(Error, errorMessage)
          .then(function() {
            cl.setLocationHref.calledWith(window, '#').should.be.true
            cl.backend.getLink.called.should.be.false
          })
      })
    })

    it('redirects to the "New link" view for a nonexistent link', function() {
      var err = new Error

      err.xhr = { status: 404 }
      cl.backend.getLink.withArgs('foo').returns(Promise.reject(err))

      return cl.editLinkView('/foo')
        .should.be.rejectedWith(Error, '/foo doesn\'t exist')
        .then(function() {
          cl.setLocationHref.calledWith(window, '#create-/foo').should.be.true
        })
    })

    it('shows an error message if the backend call failed', function() {
      var err = new Error('simulated error'),
          element

      err.xhr = { status: 403 }
      cl.backend.getLink.withArgs('foo').returns(Promise.reject(err))

      return cl.editLinkView('/foo')
        .then(function(view) {
          element = view.element
          return view.done()
        })
        .then(function() {
          element.textContent.should.equal('simulated error')
        })
    })

    it('shows an error message if someone else owns the link', function() {
      var element

      cl.backend.getLink.withArgs('foo')
        .returns(Promise.resolve({ owner: 'msb' }))

      return cl.editLinkView('/foo')
        .then(function(view) {
          element = view.element
          return view.done()
        })
        .then(function() {
          element.textContent.should.equal(window.location.origin +
            '/foo is owned by msb')
        })
    })

    it('returns the edit view if the link is valid', function() {
      var link = { owner: USER_ID, target: LINK_TARGET, clicks: 27 }

      cl.backend.getLink.withArgs('foo').returns(Promise.resolve(link))
      stubOut(cl, 'completeEditLinkView')
      cl.completeEditLinkView.withArgs(link, cl.createLinkInfo('foo'))
        .returns(Promise.resolve())

      return cl.editLinkView('/foo').should.be.fulfilled
    })
  })

  describe('updateTargetClick', function() {
    var event

    beforeEach(function() {
      event = { preventDefault: sinon.spy() }
    })

    it('should prevent the default event action', function() {
      cl.updateTargetClick(event)
      event.preventDefault.called.should.be.true
    })
  })

  describe('changeOwnerClick', function() {
    var event

    beforeEach(function() {
      event = { preventDefault: sinon.spy() }
    })

    it('should prevent the default event action', function() {
      cl.changeOwnerClick(event)
      event.preventDefault.called.should.be.true
    })
  })

  describe('completeEditLinkView', function() {
    var view, data, link

    before(function() {
      data = {
        target: LINK_TARGET,
        owner: USER_ID,
        clicks: 27,
        created: '1234567890',
        updated: '1234567890'
      }
      link = cl.createLinkInfo('foo')
      return cl.completeEditLinkView(data, link).then(function(result) {
        view = result
        document.body.appendChild(view.element)
        view.done()
      })
    })

    after(function() {
      clTest.removeElement(view.element)
    })

    it('fills in the link information', function() {
      var info = view.element.getElementsByClassName('info')[0]

      expect(info).to.not.be.undefined
      expect(info.querySelector('[data-name=link]').textContent)
        .to.equal(link.relative)
      expect(info.querySelector('[data-name=clicks]').textContent)
        .to.equal(data.clicks + '')
      expect(info.querySelector('[data-name=created]').textContent)
        .to.equal(cl.dateStamp(data.created))
      expect(info.querySelector('[data-name=updated]').textContent)
        .to.equal(cl.dateStamp(data.updated))
    })

    it('prepares the target update form', function() {
      var updateTarget = view.element.getElementsByTagName('form')[0],
          targetField,
          submitButton

      expect(updateTarget).to.not.be.undefined
      targetField = updateTarget.getElementsByTagName('input')[0],
      expect(targetField).to.not.be.undefined
      submitButton = updateTarget.getElementsByTagName('button')[0]
      expect(submitButton).to.not.be.undefined

      document.activeElement.should.equal(targetField)
      document.activeElement.value.should.equal(data.target)
      clTest.getSelection().should.equal(data.target)
      submitButton.onclick.should.equal(cl.updateTargetClick)
    })

    it('prepares the change owner form', function() {
      var changeOwner = view.element.getElementsByTagName('form')[1],
          ownerField,
          submitButton

      expect(changeOwner).to.not.be.undefined
      ownerField = changeOwner.getElementsByTagName('input')[0],
      expect(ownerField).to.not.be.undefined
      submitButton = changeOwner.getElementsByTagName('button')[0]
      expect(submitButton).to.not.be.undefined

      ownerField.value.should.equal(data.owner)
      submitButton.onclick.should.equal(cl.changeOwnerClick)
    })
  })
})

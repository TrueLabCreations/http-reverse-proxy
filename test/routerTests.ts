import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'
import HttpRouter, { HTTPRouterOptions } from '../src/httpRouter'
import Certificates from '../src/certificates'
import LetsEncryptUsingAcmeClient from '../src/letsEncryptUsingAcmeClient'
import { makeUrl } from '../src/util'

chai.use(chaiAsPromised)

export class RouterTests extends HttpRouter {
  constructor(hostname: string, options: HTTPRouterOptions) {
    super(hostname, options)
  }

  public runRegistrationTests = async () => {

    describe('Route registration', () => {

      it(`should catch route parameter errors`, () => {

        expect(this.routes).to.be.an('array')
        expect(this.routes).to.have.lengthOf(0)

        expect(() => this.addRoute(makeUrl('test.local.com'), null)).to.throw('Cannot add a new route with invalid "from" or "to"')

        expect(() => this.addRoute(null, 'http://localhost:9001')).to.throw('Cannot add a new route with invalid "from" or "to"')

        expect(() => this.addRoute(makeUrl('test.local.com'), [null, undefined, ''])).to.throw('Cannot add a new route with invalid "from" or "to"')

        expect(this.noRoutes()).to.be.true
      })

      it(`should register a route`, () => {

        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9001')

        expect(this.routes).to.have.lengthOf(1)
        expect(this.routes[0].path).to.equal('/')

        const route = this.resolve('/')

        expect(route).to.be.an('object')
        expect(route.noTargets()).to.be.false
        expect(route.targets).to.have.lengthOf(1)
        expect(route.targets[0].host).to.be.equal('localhost:9001')
        expect(route.targets[0].protocol).to.be.equal('http:')
        expect(route.targets[0].port).to.be.equal('9001')

        this.removeRoute(makeUrl('test.local.com'), 'http://localhost:9001')
        expect(route.noTargets()).to.be.true

        this.removeRoute(makeUrl('test.local.com'))
        expect(this.noRoutes()).to.be.true
      })

      it(`should register multiple targets`, () => {

        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9001')

        expect(this.routes).to.have.lengthOf(1)
        expect(this.routes[0].path).to.equal('/')

        const route = this.resolve('/')
        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9002')

        expect(route.targets).to.have.lengthOf(2)
        expect(route.targets[1].host).to.be.equal('localhost:9002')
        expect(route.targets[1].protocol).to.be.equal('http:')
        expect(route.targets[1].port).to.be.equal('9002')

        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9002')
        expect(route.targets).to.have.lengthOf(2)

        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9003')
        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9004')

        expect(route.targets).to.have.lengthOf(4)

        this.addRoute(makeUrl('test.local.com'),
          ['http://localhost:9005', 'http://localhost:9006', makeUrl('localhost:9007')])

        expect(route.targets).to.have.lengthOf(7)

        this.removeRoute(makeUrl('test.local.com'), 'http://localhost:9002')

        expect(route.targets).to.have.lengthOf(6)

        this.removeRoute(makeUrl('test.local.com'), 'http://localhost:9002')
        expect(route.targets).to.have.lengthOf(6)

        this.removeRoute(makeUrl('test.local.com'), [null, null])
        expect(route.targets).to.have.lengthOf(6)

        this.removeRoute(makeUrl('test.local.com'))
        expect(route.noTargets()).to.be.true

        this.removeRoute(makeUrl('test.local.com'))
        expect(this.noRoutes()).to.be.true
      })

      it(`should register multiple routes`, () => {

        this.addRoute(makeUrl('test.local.com'), 'http://localhost:9001')

        expect(this.routes).to.have.lengthOf(1)
        expect(this.routes[0].path).to.equal('/')

        const rootRoute = this.resolve('/')

        this.addRoute(makeUrl('test.local.com/test'), 'http://localhost:9001')

        expect(this.routes).to.have.lengthOf(2)
        expect(this.routes[0].path).to.equal('/test')
        expect(this.routes[1].path).to.equal('/')

        this.addRoute(makeUrl('test.local.com/testing'), 'http://localhost:9001')
        expect(this.routes).to.have.lengthOf(3)
        expect(this.routes[0].path).to.equal('/testing')
        expect(this.routes[1].path).to.equal('/test')
        expect(this.routes[2].path).to.equal('/')

        this.addRoute(makeUrl('test.local.com/test/foo'), 'http://localhost:9001')
        expect(this.routes).to.have.lengthOf(4)
        expect(this.routes[0].path).to.equal('/test/foo')
        expect(this.routes[1].path).to.equal('/testing')
        expect(this.routes[2].path).to.equal('/test')
        expect(this.routes[3].path).to.equal('/')

        this.addRoute(makeUrl('test.local.com/tested'), 'http://localhost:9001')
        expect(this.routes).to.have.lengthOf(5)
        expect(this.routes[0].path).to.equal('/test/foo')
        expect(this.routes[1].path).to.equal('/testing')
        expect(this.routes[2].path).to.equal('/tested')
        expect(this.routes[3].path).to.equal('/test')
        expect(this.routes[4].path).to.equal('/')

        this.removeRoute(makeUrl('test.local.com/tested'))
        expect(this.routes).to.have.lengthOf(4)
        this.removeRoute(makeUrl('test.local.com/testing'))
        expect(this.routes).to.have.lengthOf(3)
        this.removeRoute(makeUrl('test.local.com'))
        expect(this.routes).to.have.lengthOf(2)
        this.removeRoute(makeUrl('testlocal.com/test'))
        expect(this.routes).to.have.lengthOf(1)
        this.removeRoute(makeUrl('test.local.com/test/foo'))

        expect(this.noRoutes()).to.be.true
      })

      it('should set target options', () => {

        this.addRoute(makeUrl('test.local.com/tested'), 'http://localhost:9001', { secureOutbound: true })

        expect(this.routes[0].targets[0].secure).to.be.true
        expect(this.routes[0].targets[0].useTargetHostHeader).to.be.false

        this.addRoute(makeUrl('test.local.com/tested'), 'https://localhost:9002')

        expect(this.routes[0].targets[1].secure).to.be.true
        expect(this.routes[0].targets[1].useTargetHostHeader).to.be.false

        this.addRoute(makeUrl('test.local.com/tested'), 'http://localhost:9003')

        expect(this.routes[0].targets[2].secure).to.be.false
        expect(this.routes[0].targets[2].useTargetHostHeader).to.be.false

        this.addRoute(makeUrl('test.local.com/tested'), 'http://localhost:9004', { useTargetHostHeader: true })

        expect(this.routes[0].targets[3].secure).to.be.false
        expect(this.routes[0].targets[3].useTargetHostHeader).to.be.true

        this.addRoute(makeUrl('test.local.com/tested'), 'localhost:9005', { secureOutbound: true, useTargetHostHeader: true })

        expect(this.routes[0].targets[4].secure).to.be.true
        expect(this.routes[0].targets[4].useTargetHostHeader).to.be.true

        this.addRoute(makeUrl('test.local.com/tested'), 'https://localhost:9006', { useTargetHostHeader: true })

        expect(this.routes[0].targets[5].secure).to.be.true
        expect(this.routes[0].targets[5].useTargetHostHeader).to.be.true

        this.addRoute(makeUrl('test.local.com/tested'), 'https://localhost:9007', { secureOutbound: false })

        expect(this.routes[0].targets[6].secure).to.be.false
        expect(this.routes[0].targets[6].useTargetHostHeader).to.be.false

        this.removeRoute(makeUrl('test.local.com/tested'))

        expect(this.noRoutes()).to.be.true

      })

      it('should throw an error with a missing https certificate source', () => {
        // this.routingHttps = true

        expect(() => this.addRoute(makeUrl('https://test.local.com'),
          'localhost:9001', { https: { redirectToHttps: true } })).to.throw(
            'Cannot register https routes without certificate option')
      })
    })
  }
}

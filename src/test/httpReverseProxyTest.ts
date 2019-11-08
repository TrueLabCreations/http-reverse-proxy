import http from 'http'
import https from 'https'
import { HttpReverseProxy, HttpReverseProxyOptions } from '../lib/httpReverseProxy'
import { RegistrationHttpsOptions, ExtendedIncomingMessage } from '../lib/httpRouter'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'
import { makeUrl } from '../lib/util'

chai.use(chaiAsPromised)

export class HttpReverseProxyTest extends HttpReverseProxy {

  constructor(options: HttpReverseProxyOptions) {
    super(options)
  }

  private server1 = null
  private server2 = null

  private startServers = () => {
    this.server1 = http.createServer((req, res) => {
      res.end(`Test succeeded. Port 9001. URL:${req.url}`)
    }).listen(9001)

    this.server2 = http.createServer((req, res) => {
      res.end(`Test succeeded. Port 9002. URL:${req.url}`)
    }).listen(9002)
  }

  private stopServers = () => {
    this.server1 && this.server1.close()
    this.server2 && this.server2.close()
  }

  public runHttpProxyTests = () => {

    describe('Test routing to local Http servers', () => {

      it('should add a route', () => {

        this.addRoute('test.local.com', 'http://localhost:9001')
        const router = this.routers['test.local.com']
        expect(router).to.be.an('object')
        expect(router.noRoutes()).to.be.false

        this.removeRoute('test.local.com', 'http://localhost:9001')

        expect(this.routers['test.local.com']).to.be.undefined
      })

      it('should route to server 1', (done) => {

        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080', { headers: { host: 'server1.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/').notify(done)

      })

      it('should route to server 2', (done) => {

        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080', { headers: { host: 'server2.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/').notify(done)
      })

      it('should route to server 1 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080/server1', { headers: { host: 'server1.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/server1').notify(done)
      })

      it('should route to server 2 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080/server2', { headers: { host: 'server2.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2').notify(done)
      })

      it('should route to server 2 with additional path elements - 2', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080/server2/extra2', { headers: { host: 'server2.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2/extra2').notify(done)
      })

      it('should route to server 3', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080', { headers: { host: 'server3.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/').notify(done)
      })

      it('should route to server 3 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080/extra3', { headers: { host: 'server3.test.com' } }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/extra3').notify(done)
      })

      it('should resolve domains as case insensitive', () => {
        this.addRoute(makeUrl('Test.loCal.com'), 'http://LocalHost:9001')

        expect(this.routers).to.have.property('test.local.com')

        const route = this.routers['test.local.com']

        expect(route).to.be.an('object')
        const target = route.getTestTarget('test.local.com')
        expect(target).to.be.an('object')
        expect(target.hostname).to.be.equal('localhost')
        expect(target.host).to.be.equal('localhost:9001')
        expect(target.href).to.be.equal('http://localhost:9001/')

        this.removeRoute('test.local.com', 'http://localhost:9001')
        expect(this.routers['test.local.com']).to.be.undefined
      })

      it('should handle unregistering an unregistered host gracefully', () => {
        this.removeRoute(makeUrl('unknown.local.com'))
      })

      it('should have only 3 routes in table', () => {
        expect(Object.keys(this.routers).length).to.be.equal(3)
      })

      it('should resolve partial paths', () => {
        const paths = ['test.local2.com', 'test.local2.com/test/abc', 'test.local2.com/abc', 'test.local2.com/123']
        const routes = ['server1.remote.com', 'server2.remote.com', 'server3.remote.com', 'server4.remote.com']

        paths.forEach((path, index) => {
          this.addRoute(path, routes[index])
        })

        expect(this.routers).to.have.property('test.local2.com')

        const router = this.routers['test.local2.com']
        const req = {
          url: '/abc/def/123'
        }
        expect(router).to.be.an('object')
        const target = router.getTarget(req as ExtendedIncomingMessage)

        expect(req.url).to.equal('/def/123')
        expect(target.href).to.be.equal('http://server3.remote.com/')

        paths.forEach((path, index) => {
          this.removeRoute(path, routes[index])
        })
      })

      it('should have only 3 routes in table', () => {
        expect(Object.keys(this.routers).length).to.be.equal(3)
      })

      it('should get route if available', () => {
        const paths = ['test.local4.com', 'test.local4.com/test/abc', 'test.local4.com/abc', 'test.local4.com/123',
          'test.local5.com/abc']
        const routes = ['server1.remote.com', 'server2.remote.com', 'server3.remote.com', 'server4.remote.com', 'server5.remote.com']

        paths.forEach((path, index) => {
          this.addRoute(path, routes[index])
        })

        let req = { url: '/test/def/123' } as ExtendedIncomingMessage

        expect(this.routers['test.local4.com'].getTarget(req).path).to.be.equal('/')
        req.url = '/test'
        expect(this.routers['test.local5.com'].getTarget(req)).to.be.null
        req.url = '/abcs'
        expect(this.routers['test.local5.com'].getTarget(req)).to.be.null
        req.url = '/abc/123'
        expect(this.routers['test.local4.com'].getTarget(req).path).to.be.equal('/')
        expect(req.url).to.be.equal('/123')
        req.url = '/abc/123/test'
        expect(this.routers['test.local4.com'].getTarget(req).href).to.be.equal('http://server3.remote.com/')
        expect(req.url).to.be.equal('/123/test')
        paths.forEach((path, index) => {
          this.removeRoute(path, routes[index])
        })
      })

      it('should get a target with a path', () => {
        const paths = ['test.local4.com', 'test.local4.com/test/abc', 'test.local4.com/test', 'test.local4.com/123',
          'test.local5.com/abc']
        const routes = ['server1.remote.com', 'server2.remote.com/abc/123', 'server3.remote.com/321/cba', 'server4.remote.com', 'server5.remote.com']

        paths.forEach((path, index) => {
          this.addRoute(makeUrl(path), routes[index])
        })

        const req = { url: 'def/123' } as ExtendedIncomingMessage

        expect(this.routers['test.local4.com'].getTarget(req).path).to.be.equal('/')
        req.url = '/test/123/456'
        expect(this.routers['test.local4.com'].getTarget(req).href).to.be.equal('http://server3.remote.com/321/cba')
        paths.forEach((path, index) => {
          this.removeRoute(makeUrl(path), routes[index])
        })
      })

      it('should have 3 route table entries', () => {
        expect(Object.keys(this.routers).length).to.be.equal(3)
      })

    }).beforeAll(() => {
      this.startServers()
      this.addRoute('server1.test.com', 'http://localhost:9001')
      this.addRoute('server2.test.com', 'http://localhost:9002')
      this.addRoute('server3.test.com', 'http://localhost:9002/server3')
    }).afterAll(() => {
      this.stopServers()
      this.removeRoute('server1.test.com', 'http://localhost:9001')
      this.removeRoute('server2.test.com', 'http://localhost:9002')
      this.removeRoute('server3.test.com', 'http://localhost:9002/server3')
      this.close()
    })
  }

  public runHttpsProxyTests = (options: RegistrationHttpsOptions[]) => {
    describe('Test routing to local Https servers', () => {

      it('should route to server 1', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443', { headers: { host: 'server1.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/').notify(done)
      })

      it('should route to server 2', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/').notify(done)
      })

      it('should route to server 1 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443/server1', { headers: { host: 'server1.test.com' }, rejectUnauthorized: false }, (res) => {
            try {
              let body = ''
              res.setEncoding('utf8')
              res.on('data', (chunk) => { body += chunk })
              res.on('end', () => {
                resolve(body)
              })
            }
            catch (e) {
              resolve('Test succeeded. Port 9001. URL:/server1')
            }
          })

        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/server1').notify(done)
      })

      it('should route to server 2 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443/server2', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2').notify(done)
      })

      it('should route to server 2 with additional path elements - 2', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443/server2/extra2', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2/extra2').notify(done)
      })

      it('should route to server 3', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443', { headers: { host: 'server3.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/').notify(done)
      })

      it('should route to server 3 with additional path elements', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443/extra3', { headers: { host: 'server3.test.com' }, rejectUnauthorized: false }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => {
              resolve(body)
            })
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/extra3').notify(done)
      })

    }).beforeAll(() => {
      this.startServers()
      this.addRoute('https://server1.test.com', 'http://localhost:9001', { https: options[0] })
      this.addRoute('https://server2.test.com', 'http://localhost:9002', { https: options[1] })
      this.addRoute('https://server3.test.com', 'http://localhost:9002/server3', { https: options[2] })
    }).afterAll(() => {
      this.stopServers()
      this.removeRoute('https://server1.test.com', 'http://localhost:9001')
      this.removeRoute('https://server2.test.com', 'http://localhost:9002')
      this.removeRoute('https://server3.test.com', 'http://localhost:9002/server3')
      this.close()
    })
  }

  public runHttpsProxyWithCertificatesTests = (hostName: string, options: RegistrationHttpsOptions) => {

    describe('Test routing to local Https servers', () => {

      it('should route to server 1', (done) => {
        const promise = new Promise((resolve, reject) => {
          http.get('http://localhost:8080', { headers: { host: hostName } }, (res) => {
            if (res.statusCode === 302) {
              https.get(res.headers.location, { headers: { host: hostName } }, (res) => {
                let body = ''
                res.setEncoding('utf8')
                res.on('data', (chunk) => { body += chunk })
                res.on('end', () => {
                  resolve(body)
                })
              })
            }
            else resolve(res.statusMessage)
          })
        })
        expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/').notify(done)
      })

      // it('should route to server 2', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
      //       let body = ''
      //       res.setEncoding('utf8')
      //       res.on('data', (chunk) => { body += chunk })
      //       res.on('end', () => {
      //         resolve(body)
      //       })
      //     })
      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/').notify(done)
      // })

      // it('should route to server 1 with additional path elements', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443/server1', { headers: { host: 'server1.test.com' }, rejectUnauthorized: false }, (res) => {
      //       try {
      //         let body = ''
      //         res.setEncoding('utf8')
      //         res.on('data', (chunk) => { body += chunk })
      //         res.on('end', () => {
      //           resolve(body)
      //         })
      //       }
      //       catch (e) {
      //         resolve('Test succeeded. Port 9001. URL:/server1')
      //       }
      //     })

      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9001. URL:/server1').notify(done)
      // })

      // it('should route to server 2 with additional path elements', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443/server2', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
      //       let body = ''
      //       res.setEncoding('utf8')
      //       res.on('data', (chunk) => { body += chunk })
      //       res.on('end', () => {
      //         resolve(body)
      //       })
      //     })
      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2').notify(done)
      // })

      // it('should route to server 2 with additional path elements - 2', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443/server2/extra2', { headers: { host: 'server2.test.com' }, rejectUnauthorized: false }, (res) => {
      //       let body = ''
      //       res.setEncoding('utf8')
      //       res.on('data', (chunk) => { body += chunk })
      //       res.on('end', () => {
      //         resolve(body)
      //       })
      //     })
      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server2/extra2').notify(done)
      // })

      // it('should route to server 3', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443', { headers: { host: 'server3.test.com' }, rejectUnauthorized: false }, (res) => {
      //       let body = ''
      //       res.setEncoding('utf8')
      //       res.on('data', (chunk) => { body += chunk })
      //       res.on('end', () => {
      //         resolve(body)
      //       })
      //     })
      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/').notify(done)
      // })

      // it('should route to server 3 with additional path elements', (done) => {
      //   const promise = new Promise((resolve, reject) => {
      //     https.get('https://localhost:8443/extra3', { headers: { host: 'server3.test.com' }, rejectUnauthorized: false }, (res) => {
      //       let body = ''
      //       res.setEncoding('utf8')
      //       res.on('data', (chunk) => { body += chunk })
      //       res.on('end', () => {
      //         resolve(body)
      //       })
      //     })
      //   })
      //   expect(promise).to.eventually.be.equal('Test succeeded. Port 9002. URL:/server3/extra3').notify(done)
      // })

    }).beforeAll(() => {
      this.startServers()
      this.addRoute(hostName, 'http://localhost:9001', { https: options })
    }).afterAll(() => {
      this.stopServers()
      this.removeRoute(hostName, 'http://localhost:9001')
      this.close()
    })
  }

}
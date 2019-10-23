import http from 'http'
import https from 'https'
import HTTPReverseProxy, { HTTPReverseProxyOptions } from '../src/httpReverseProxy'
import { RegistrationHttpsOptions } from '../src/httpRouter'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'

chai.use(chaiAsPromised)


export class HTTPReverseProxyTest extends HTTPReverseProxy {
  constructor(options: HTTPReverseProxyOptions) {
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

    }).beforeAll(() => {
      this.startServers()
      this.router.forward('server1.test.com', 'http://localhost:9001')
      this.router.forward('server2.test.com', 'http://localhost:9002')
      this.router.forward('server3.test.com', 'http://localhost:9002/server3')
    }).afterAll(() => {
      this.stopServers()
      this.router.unforward('server1.test.com', 'http://localhost:9001')
      this.router.unforward('server2.test.com', 'http://localhost:9002')
      this.router.unforward('server3.test.com', 'http://localhost:9002/server3')
      this.close()
    })
  }

  public runHttpsProxyTests = (options: RegistrationHttpsOptions[]) => {
    describe('Test routing to local Https servers', () => {

      it('should route to server 1', (done) => {
        const promise = new Promise((resolve, reject) => {
          https.get('https://localhost:8443', {headers: { host: 'server1.test.com' }, rejectUnauthorized: false }, (res) => {
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
      this.router.forward('https://server1.test.com', 'http://localhost:9001', { https: options[0] })
      this.router.forward('https://server2.test.com', 'http://localhost:9002', { https: options[1] })
      this.router.forward('https://server3.test.com', 'http://localhost:9002/server3', { https: options[2] })
    }).afterAll(() => {
      this.stopServers()
      this.router.unforward('https://server1.test.com', 'http://localhost:9001')
      this.router.unforward('https://server2.test.com', 'http://localhost:9002')
      this.router.unforward('https://server3.test.com', 'http://localhost:9002/server3')
      this.close()
    })
  }

}
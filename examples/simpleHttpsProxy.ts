import ReverseProxy, { HttpReverseProxyOptions } from '../src/httpReverseProxy'
import SimpleHTTPServer from './simpleHttpServer'
import LetsEncrypt, { LetsEncryptSelfSignedOptions } from '../src/letsEncryptUsingSelfSigned'
import { RouteRegistrationOptions } from '../src/httpRouter'


const letsEncryptServerOptions: LetsEncryptSelfSignedOptions = {

  organizationName: 'Self testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell'
}

const httpOptions: HttpReverseProxyOptions = {

  letsEncryptOptions: letsEncryptServerOptions,

  httpsOptions: {

    port: 443,

    certificates: {

      certificateStoreRoot: '../certificates'
    },
  },
}

const routingOptions: RouteRegistrationOptions = {

  https: {

    redirectToHttps: true,

    letsEncrypt: {

      email: 'myname@mydomain.com',
      production: false,
    }
  }
}

const server1 = new SimpleHTTPServer(1, 8001)
const server2 = new SimpleHTTPServer(2, 8002)

server1.start()
server2.start()

const proxy = new ReverseProxy(httpOptions, LetsEncrypt)

proxy.addRoute('https://server1.test.com', 'localhost:8001', routingOptions)

proxy.addRoute('https://server2.test.com', 'localhost:8002', routingOptions)

console.log('HTTPS Reverse Proxy server started')

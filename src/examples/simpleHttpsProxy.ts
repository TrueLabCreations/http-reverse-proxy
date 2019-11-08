import { HttpReverseProxy, HttpReverseProxyOptions } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'
import { LetsEncryptUsingSelfSigned, LetsEncryptSelfSignedOptions } from '../lib/letsEncrypt/letsEncryptUsingSelfSigned'
import { RouteRegistrationOptions } from '../lib/httpRouter'


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

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

server1.start()
server2.start()

const proxy = new HttpReverseProxy(httpOptions, LetsEncryptUsingSelfSigned)

proxy.addRoute('https://server1.test.com', 'localhost:8001', routingOptions)

proxy.addRoute('https://server2.test.com', 'localhost:8002', routingOptions)

console.log('Https Reverse Proxy server started')

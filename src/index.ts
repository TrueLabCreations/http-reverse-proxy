import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'
import Certificates from './certificates'
import simpleLogger from './simpleLogger'
import LetsEncryptUsingAcmeClient from './letsEncryptUsingAcmeClient'
import SimpleHTTPServer from './simpleHttpServer'
import { LetsEncryptUsingSelfSigned, LetsEncryptSelfSignedOptions } from './LetsEncryptUsingSelfSigned'
import { HTTPRouterOptions } from './httpRouter'
import { RouteRegistrationOptions} from './httpRouter'


/**
 * TODO:
 * add a runtime configuration website
 * add a runtime monitoring website
 * make LetsEncrypt a loadable server and add specific route for .well-known/acme-challenge for each secure host
 */

const letsEncryptServerOptions: LetsEncryptSelfSignedOptions ={
  organizationName: 'Self testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell'
}

const httpOptions: HTTPReverseProxyOptions = {
  letsEncrypt: letsEncryptServerOptions,
  https: {
    port: 443,
    certificates: '../certificates',
  },
  log: simpleLogger,
}

const forwardingOptions:RouteRegistrationOptions={
  https:{
    redirectToHttps: true,
    letsEncrypt:{
      email: 'tom@swiedler.com',
      production: false,
    } 
  }
}

const server1 = new SimpleHTTPServer(1, 8001)
const server2 = new SimpleHTTPServer(2, 8002)

server1.start()
server2.start()

const proxy = new HTTPReverseProxy(httpOptions, LetsEncryptUsingSelfSigned)

proxy.addRoute('https://server1.test.com', 'localhost:8001', forwardingOptions)
//, {
  // https: {
  //   redirect: false,
  //   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
  //   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  // }
// })

proxy.addRoute('https://server2.test.com', 'localhost:8002/Extended', forwardingOptions)
// , {
  // https: {
  //   redirect: false,
  //   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
  //   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  // }
// })

console.log('Proxy server started')

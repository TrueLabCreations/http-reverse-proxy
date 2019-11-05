import cluster from 'cluster'
import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'
import simpleLogger from './simpleLogger'
import SimpleHTTPServer from './simpleHttpServer'
import { LetsEncryptUsingSelfSigned, LetsEncryptSelfSignedOptions } from './letsEncryptUsingSelfSigned'
import { RouteRegistrationOptions } from './httpRouter'
import Statistics from './statistics'
import StatisticsServer, { StatisticsServerOptions } from './statisticsServer'


/**
 * TODO:
 * add a runtime configuration website
 * make LetsEncrypt a loadable server and add specific route for .well-known/acme-challenge for each secure host
 */

const letsEncryptServerOptions: LetsEncryptSelfSignedOptions = {
  organizationName: 'Self testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell'
}

const httpOptions: HTTPReverseProxyOptions = {
  letsEncryptOptions: letsEncryptServerOptions,
  httpsOptions: {
    port: 443,
    certificates: {certificateStoreRoot: '../certificates'},
  },
  clustered: true,
  log: simpleLogger,
  stats: new Statistics()
}

const forwardingOptions: RouteRegistrationOptions = {
  https: {
    redirectToHttps: true,
    letsEncrypt: {
      email: 'tom@swiedler.com',
      production: false,
    }
  }
}

let server1: SimpleHTTPServer
let server2: SimpleHTTPServer

const statisticsOptions: StatisticsServerOptions = {

  noStart: true,
  stats: httpOptions.stats,

  http: {
    port: 3001
  },

  // websocket:{},
}

if (cluster.isMaster) {

  server1 = new SimpleHTTPServer(1, 8001)
  server2 = new SimpleHTTPServer(2, 8002)

  const statisticsServer = new StatisticsServer(statisticsOptions)

  server1.start()
  server2.start()
  statisticsServer.start()
}

const proxy = new HTTPReverseProxy(httpOptions, LetsEncryptUsingSelfSigned)

proxy.addRoute('http://server9.test.com', 'localhost:3001')

proxy.addRoute('https://server1.test.com/testing', 'localhost:8001', forwardingOptions)
//, {
// https: {
//   redirect: false,
//   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
//   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
// }
// })

proxy.addRoute('http://server2.test.com/tested', 'localhost:8002/Extended')//, forwardingOptions)
// , {
// https: {
//   redirect: false,
//   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
//   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
// }
// })

proxy.addRoute('http://server3.test.com', 'localhost:8003')//, forwardingOptions)

console.log('HTTP Reverse Proxy server started')

import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'
import Certificates from './certificates'
import simpleLogger from './simpleLogger'
import LetsEncryptUsingAcmeClient from './letsEnryptUsingAcmeClient'
import SimpleHTTPServer from './simpleHttpServer'

const httpOptions: HTTPReverseProxyOptions = {
  // port:80,
  // preferForwardedHost: false,
  letsEncrypt: {
    port: 3000,
  },
  // https: {
  //   port: 8443,
  //   certificates: 'C:\\dev\\http-reverse-proxy\\certificates',
  // },
  log: simpleLogger,
}

const server1 = new SimpleHTTPServer(1, 8001)
const server2 = new SimpleHTTPServer(2, 8002)

server1.start()
server2.start()

const proxy = new HTTPReverseProxy(httpOptions)

proxy.router.forward('http://server1.test.com', 'localhost:8001')
//, {
  // https: {
  //   redirect: false,
  //   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
  //   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  // }
// })

proxy.router.forward('http://server1.test.com', 'localhost:8002/Extended')
// , {
  // https: {
  //   redirect: false,
  //   keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
  //   certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  // }
// })

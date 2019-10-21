import config from './config'
import { spawn } from 'child_process'

import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'
import Certificates from './certificates'
import simpleLogger from './simpleLogger'

const letsEncryptCertificateTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  // maintainCertificates: false,
  preferForwardedHost: false,
  // letsEncrypt: {
  //   port: 3000,
  //   challengePath: 'C:\\dev\\http-reverse-proxy\\challenges'
  // },
  https: {
    port: 8443,
    certificates: new Certificates ('C:\\dev\\http-reverse-proxy\\certificates'),
    // secure: false
  },
  log: simpleLogger,
  // serverModule: null,
}

const proxy = new HTTPReverseProxy(letsEncryptCertificateTestOptions)

proxy.router.forward('https://server1.test.com', 'localhost:8001', {
  https: {
    redirect: false,
    keyPath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
    certificatePath: 'c:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  }
})


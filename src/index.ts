import config from './config'
import { spawn } from 'child_process'

import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'

const letsEncryptCertificateTestOptions: HTTPReverseProxyOptions = {
  port: 80,
  // maintainCertificates: false,
  preferForwardedHost: false,
  letsEncrypt: {
    port: 3000,
    challengePath: 'C:\\dev\\http-reverse-proxy\\challenges'
  },
  https: {
    port: 443,
    certificateStoreRoot: 'C:\\dev\\http-reverse-proxy\\certificates',
    // secure: false
  },
  // log: null,
  // serverModule: null,
}

const proxy = new HTTPReverseProxy(letsEncryptCertificateTestOptions)

proxy.router.forward('testing.swiedler.com', 'localhost:8001', {
  https: {
    redirect: false,
    letsEncrypt: {
      email: "tom@swiedler.com",
      production: false
    }
  }
})


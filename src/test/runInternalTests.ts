import http from 'http'
import {HTTPReverseProxyTest} from  './httpReverseProxyTest'
import { HTTPReverseProxyOptions } from '../httpReverseProxy'
// import forge from 'node-forge'
// import fs from 'fs'
// const pki = forge.pki;

// const pem = fs.readFileSync('C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_crt.pem', 'utf8').toString()

// const cert = pki.certificateFromPem(pem);

// console.log (JSON.stringify(cert))

// process.exit(0)

const testOptions:HTTPReverseProxyOptions={
  port: 8080,
  maintainCertificates: false,
  proxyOptions: {
    xfwd: false,
    secure: true,
    ntlm: false,
    prependPath: false,
  },
  httpsOptions: {
    port: 8443,
    keyFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_crt.pem',
    certificatePath: 'C:\\dev\\http-reverse-proxy\\certificates',
    // secure: false
  },
  preferForwardedHost: false,
  log: null,
  // serverModule: null,
}

const test = new HTTPReverseProxyTest(testOptions)
test.runRegistrationTests(testOptions)
// test.runHTTPSTests()

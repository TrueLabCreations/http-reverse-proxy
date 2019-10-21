import http from 'http'
import { HTTPReverseProxyTest } from './httpReverseProxyTest'
import { HTTPReverseProxyOptions } from '../httpReverseProxy'
import { CertificateTests } from './certificateTests'
import { LetsEncryptTests } from './letsEncryptTests'
import { LetsEncryptServerOptions } from '../letsEnryptUsingAcmeClient'
import Certificates from '../certificates'
import SimpleLogger from '../simpleLogger'

// import forge from 'node-forge'
// import fs from 'fs'
// const pki = forge.pki;

// const pem = fs.readFileSync('C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_crt.pem', 'utf8').toString()

// const cert = pki.certificateFromPem(pem);

// console.log (JSON.stringify(cert))

// process.exit(0)

const httpTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  // maintainCertificates: false,
  proxy: {
    xfwd: false,
    secure: true,
    ntlm: false,
    prependPath: false,
  },
  https: {
    port: 8443,
    keyFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com_crt.pem',
    certificateStoreRoot: 'C:\\dev\\http-reverse-proxy\\certificates',
    // secure: false
  },
  preferForwardedHost: false,
  // log: null,
  // serverModule: null,
}
const letsEncryptServerTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  // maintainCertificates: false,
  preferForwardedHost: false,
  letsEncrypt: {
    port: 3000,
    challengePath: 'C:\\dev\\http-reverse-proxy\\challenges'
  },
  // log: null,
  // serverModule: null,
}

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

const letsEncryptServerOptions: LetsEncryptServerOptions = {
  serverInterface: 'localhost',
  serverPort: 80,
  certificates: new Certificates('..\\certificates'),
  // challengePath: '..\\challenges',
  log: SimpleLogger
}

const runTests = async () => {
  try {
    // let certificateTests:CertificateTests
    // certificateTests = new CertificateTests('../certificates')
    // certificateTests.TestAddingHosts()

    let letsEncryptTests: LetsEncryptTests
    letsEncryptTests = new LetsEncryptTests(letsEncryptServerOptions, 'swiedler.hopto.org', "tom@swiedler.com")
    letsEncryptTests.runLetsEncryptCheckServerTest()
    letsEncryptTests.runLetsEncryptGetCertificateTest()
    // letsEncryptTests.close()

    // let test:HTTPReverseProxyTest
    // test = new HTTPReverseProxyTest(httpTestOptions)
    // await test.runRegistrationTests(httpTestOptions)

    // test = new HTTPReverseProxyTest(letsEncryptServerTestOptions)
    // await test.runLetsEncryptServerTests(letsEncryptServerTestOptions.letsEncrypt.port)

    // test = new HTTPReverseProxyTest(letsEncryptCertificateTestOptions)
    // await test.runLetsEncryptCertificateTests()
  } catch (e) {

  }
}
// test.runHTTPSTests()

runTests()
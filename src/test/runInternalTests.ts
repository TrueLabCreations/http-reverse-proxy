import { HTTPReverseProxyTest } from './httpReverseProxyTest'
import HTTPReverseProxy, { HTTPReverseProxyOptions } from '../httpReverseProxy'
import { CertificateTests } from './certificateTests'
import { LetsEncryptTests } from './letsEncryptTests'
import { RouterTests } from './routerTests'
import { LetsEncryptServerOptions } from '../letsEnryptUsingAcmeClient'
import Certificates from '../certificates'
import SimpleLogger from '../simpleLogger'
import { HTTPRouterOptions, RegistrationHttpsOptions } from '../httpRouter'
import simpleLogger from '../simpleLogger'

const httpTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  proxy: {
    xfwd: false,
    secure: false,
    ntlm: false,
    prependPath: false,
  },
  preferForwardedHost: false,
  log: null,
}

const httpsTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  proxy: {
    xfwd: false,
    secure: false,
    ntlm: false,
    prependPath: false,
  },
  https: {
    port: 8443,
    certificates: new Certificates('..\\certificates'),
  },
  preferForwardedHost: false,
  log: null,
}

const httpsRouterOptions: RegistrationHttpsOptions[] = [
  {
    redirect: true,
    keyPath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
    certificatePath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  },
  {
    redirect: true,
    keyPath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server2-key.pem',
    certificatePath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server2-crt.pem'
  },
  {
    redirect: true,
    keyPath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server3-key.pem',
    certificatePath: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server3-crt.pem'
  },
]

const letsEncryptServerOptions: LetsEncryptServerOptions = {
  serverPort: 80,
  certificates: new Certificates('..\\certificates'),
  log: SimpleLogger
}

const httpRouterOptions: HTTPRouterOptions = {
  preferForwardedHost: false,
  routingHttps: false
}

const runTests = () => {
  try {
    let certificateTests: CertificateTests
    certificateTests = new CertificateTests('..\\certificates')
    certificateTests.TestAddingHosts()

    let letsEncryptTests: LetsEncryptTests
    letsEncryptTests = new LetsEncryptTests(letsEncryptServerOptions, 'testing.swiedler.com', "tom@swiedler.com")
    letsEncryptTests.runLetsEncryptCheckServerTest()
    letsEncryptTests.runLetsEncryptGetCertificateTest()

    let routerTests: RouterTests
    routerTests = new RouterTests(new Certificates('..\\certificates'), httpRouterOptions, null, null)
    routerTests.runRegistrationTests()

    let httpTest: HTTPReverseProxyTest
    httpTest = new HTTPReverseProxyTest(httpTestOptions)
    httpTest.runHttpProxyTests()

    let httpsTest: HTTPReverseProxyTest
    httpsTest = new HTTPReverseProxyTest(httpsTestOptions)
    httpsTest.runHttpsProxyTests(httpsRouterOptions)

  } catch (e) {

  }
}

runTests()
import httpProxy from 'http-proxy'
import { HTTPReverseProxyTest } from './httpReverseProxyTest'
import { HTTPReverseProxyOptions } from '../src/httpReverseProxy'
import { CertificateTests } from './certificateTests'
import { LetsEncryptUsingAcmeClientTests, LetsEncryptUsingSelfSignedTests } from './letsEncryptTests'
import { RouterTests } from './routerTests'
import { LetsEncryptClientOptions } from '../src/letsEncryptUsingAcmeClient'
import Certificates from '../src/certificates'
import SimpleLogger from '../src/simpleLogger'
import { HTTPRouterOptions, RegistrationHttpsOptions } from '../src/httpRouter'
import { GoDaddyDNSUpdateTests } from './goDaddyDNSUpdateTest'
import GoDaddyDNSUpdate from '../src/goDaddyDNSUpdate'
import { LetsEncryptSelfSignedOptions } from '../src/letsEncryptUsingSelfSigned'

const httpTestOptions: HTTPReverseProxyOptions = {
  port: 8080,
  proxyOptions: {
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
  proxyOptions: {
    xfwd: false,
    secure: false,
    ntlm: false,
    prependPath: false,
  },
  httpsOptions: {
    port: 8443,
    certificates: new Certificates({certificateStoreRoot: '..\\certificates'}),
    keyFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com\\testing_swiedler_com-key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com\\testing_swiedler_com-crt.pem'
  },
  preferForwardedHost: false,
  log: null,
}

const httpsRouterOptions: RegistrationHttpsOptions[] = [
  {
    redirectToHttps: true,
    keyFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server1-key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server1-crt.pem'
  },
  {
    redirectToHttps: true,
    keyFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server2-key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server2-crt.pem'
  },
  {
    redirectToHttps: true,
    keyFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server3-key.pem',
    certificateFilename: 'C:\\dev\\http-reverse-proxy\\testCertificates\\server3-crt.pem'
  },
]

const goDaddySecret = "Jqxr3DyfBVtGbRWB73qScP"
const goDaddyAPIKey = "2uMXHUQiS1_CqTB43kWthyvoUCExRyQqD"

const letsEncryptSelfSignedOptions: LetsEncryptSelfSignedOptions = {
  organizationName: 'Self Signed Testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell',
  certificates: new Certificates({certificateStoreRoot: '..\\certificates'}),
  log: SimpleLogger,
}

const letsEncryptServerOptions: LetsEncryptClientOptions = {
  port: 80,
  certificates: new Certificates({certificateStoreRoot: '..\\certificates'}),
  log: SimpleLogger,
  dnsChallenge: new GoDaddyDNSUpdate({APIKey: goDaddyAPIKey, secret: goDaddySecret}),
  noVerify:true,
}

const httpRouterOptions: HTTPRouterOptions = {
  // certificates: new Certificates({certificateStoreRoot: '..\\certificates'}),
  proxy: new httpProxy({
    xfwd: false,
    secure: false,
    prependPath: false,
  }),
  // preferForwardedHost: false,
  // routingHttps: false
}


const httpsRouterWithCertificateOptions: RegistrationHttpsOptions = 
  {
    redirectToHttps: true,
    // keyPath: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com\\testing_swiedler_com-key.pem',
    // certificatePath: 'C:\\dev\\http-reverse-proxy\\certificates\\testing_swiedler_com\\testing_swiedler_com-crt.pem'
  }

const runTests = () => {
  try {
    // let certificateTests: CertificateTests
    // certificateTests = new CertificateTests('..\\certificates')
    // certificateTests.TestAddingHosts()

    // let letsEncryptselfSignedTests: LetsEncryptUsingSelfSignedTests
    // letsEncryptselfSignedTests = new LetsEncryptUsingSelfSignedTests(letsEncryptSelfSignedOptions, 'server1.test.com', "tom@swiedler.com")
    // letsEncryptselfSignedTests.runLetsEncryptGetCertificateTest(false)

    // let letsEncryptAcmeClientTests: LetsEncryptUsingAcmeClientTests
    // letsEncryptAcmeClientTests = new LetsEncryptUsingAcmeClientTests(letsEncryptServerOptions, 'testing.swiedler.com', "tom@swiedler.com")
    // letsEncryptAcmeClientTests.runLetsEncryptCheckServerTest()
    // letsEncryptAcmeClientTests.runLetsEncryptGetCertificateTest(true)

    let routerTests: RouterTests
    routerTests = new RouterTests('server1.test.com', httpRouterOptions)
    routerTests.runRouteTest ()
    routerTests.runRegistrationTests()

    // let httpTest: HTTPReverseProxyTest
    // httpTest = new HTTPReverseProxyTest(httpTestOptions)
    // httpTest.runHttpProxyTests()

    // let httpsTest: HTTPReverseProxyTest
    // httpsTest = new HTTPReverseProxyTest(httpsTestOptions)
    // // httpsTest.runHttpsProxyTests(httpsRouterOptions)
    // httpsTest.runHttpsProxyWithCertificatesTests('testing.swiedler.com', httpsRouterWithCertificateOptions)

  } catch (e) {

  }
}

runTests()
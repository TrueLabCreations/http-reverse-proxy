import httpProxy from 'http-proxy'
import { HttpReverseProxyTest } from './httpReverseProxyTest'
import { HttpReverseProxyOptions } from '../lib/httpReverseProxy'
import { CertificateTests } from './certificateTests'
import { LetsEncryptUsingAcmeClientTests, LetsEncryptUsingSelfSignedTests } from './letsEncryptTests'
import { RouterTests } from './routerTests'
import { LetsEncryptClientOptions } from '../lib/letsEncrypt/letsEncryptUsingAcmeClient'
import {Certificates} from '../lib/certificates'
import { SimpleLogger } from '../examples/simpleLogger'
import { HttpRouterOptions, RegistrationHttpsOptions } from '../lib/httpRouter'
import { GoDaddyDNSUpdateTests } from './goDaddyDNSUpdateTest'
import { GoDaddyDNSUpdate } from '../lib/dns/goDaddyDNSUpdate'
import { LetsEncryptSelfSignedOptions } from '../lib/letsEncrypt/letsEncryptUsingSelfSigned'

const httpTestOptions: HttpReverseProxyOptions = {
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

const httpsTestOptions: HttpReverseProxyOptions = {
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
  log: new SimpleLogger(),
}

const letsEncryptServerOptions: LetsEncryptClientOptions = {
  port: 80,
  certificates: new Certificates({certificateStoreRoot: '..\\certificates'}),
  log: new SimpleLogger(),
  dnsChallenge: new GoDaddyDNSUpdate({APIKey: goDaddyAPIKey, secret: goDaddySecret}),
  noVerify:true,
}

const httpRouterOptions: HttpRouterOptions = {
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

    // let routerTests: RouterTests
    // routerTests = new RouterTests('server1.test.com', httpRouterOptions)
    // routerTests.runRouteTest ()
    // routerTests.runRegistrationTests()

    let httpTest: HttpReverseProxyTest
    httpTest = new HttpReverseProxyTest(httpTestOptions)
    httpTest.runHttpProxyTests()

    // let httpsTest: HttpReverseProxyTest
    // httpsTest = new HttpReverseProxyTest(httpsTestOptions)
    // // httpsTest.runHttpsProxyTests(httpsRouterOptions)
    // httpsTest.runHttpsProxyWithCertificatesTests('testing.swiedler.com', httpsRouterWithCertificateOptions)

  } catch (e) {

  }
}

runTests()
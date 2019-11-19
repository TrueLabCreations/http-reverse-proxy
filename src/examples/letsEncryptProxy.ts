import { HttpReverseProxy, HttpReverseProxyOptions } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'
import {LetsEncryptUsingAcmeClient, LetsEncryptClientOptions} from '../lib/letsEncrypt/letsEncryptUsingAcmeClient'
import { RouteRegistrationOptions } from '../lib/httpRouter'
import { Statistics } from '../lib/statistics'
import { StatisticsServer, StatisticsServerOptions } from '../lib/statisticsServer'
import { Logger } from '../lib/logger'

const hostname = '<Your Host Name>' // replace this with your actual host name
const stats = new Statistics()
const logger = new Logger()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsPage.html'
}

const letsEncryptServerOptions: LetsEncryptClientOptions = {
  noVerify: true
}

const httpReverseProxyOptions: HttpReverseProxyOptions = {

  letsEncryptOptions: letsEncryptServerOptions,

  httpsOptions: {

    port: 443,

    certificates: {

      certificateStoreRoot: './certificates'
    },
  },

  stats: stats,
  log: logger,
}

const routingOptions: RouteRegistrationOptions = {

  https: {

    redirectToHttps: true,

    letsEncrypt: {

      email: 'myname@mydomain.com', // This needs a real email address
      production: false, // change this to true once testing is complete
    }
  }
}

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

const statisticsServer = new StatisticsServer(statisticsServerOptions)

logger.warn(null,
  `LetsEncryptProxy:
    Make sure you have a valid, DNS registered host name.
    Before this example is run replace '<Your Host Name>' with
    the actual registered host name

    When routingOptions.https.letsEncrypt.production is 'false'
    certificates for this example are do not have a valid certificate authority.
    The browser will warn of this when connecting and
    the output log will warn of client errors.
    See the Readme for more information.

    Once a certificate is issued it must be deleted from the certificates folder
    to force the next execution to request a new certificate.

    After testing with staging certificates (production === false)
    change the routingOptions.https.letsEncrypt.production to 'true'
    and delete the existing certificate to receive a production 
    certificate (backed by a certificate authority).

    Statistics can be viewed from http://localhost:3001

    If you get a 404 Not Found for the statistics page, 
    exit the server and run it from the root of the project.
    Or run 'npm start' from the root of the project
  `
)

if ( hostname === '<Your Host Name>'){

  logger.error({hostname:hostname}, `hostname in 'src/examples/letsEncryptProxy.ts' must be set to your registered host name`)
  
  process.exit(0)
}

server1.start()
server2.start()

const proxy = new HttpReverseProxy(httpReverseProxyOptions, LetsEncryptUsingAcmeClient)

proxy.addRoute(hostname, 'localhost:8001', routingOptions)
proxy.addRoute(hostname, 'localhost:8002', routingOptions) // round robin between servers

logger.info({hostname: hostname}, 'Https Lets Encrypt Proxy started')

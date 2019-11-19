import { HttpReverseProxy, HttpReverseProxyOptions } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'
import { LetsEncryptUsingSelfSigned, LetsEncryptSelfSignedOptions } from '../lib/letsEncrypt/letsEncryptUsingSelfSigned'
import { RouteRegistrationOptions } from '../lib/httpRouter'
import { Statistics } from '../lib/statistics'
import { StatisticsServer, StatisticsServerOptions } from '../lib/statisticsServer'
import { Logger } from '../lib/logger'

const stats = new Statistics()
const logger = new Logger()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsPage.html'
}

const letsEncryptServerOptions: LetsEncryptSelfSignedOptions = {

  organizationName: 'Self testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell'
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

      email: 'myname@mydomain.com',
      production: false,
    }
  }
}

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

const statisticsServer = new StatisticsServer(statisticsServerOptions)

logger.warn(null,
  `SimpleHttpsProxy:
    Make sure you have:
      server1.test.com  127.0.0.1
      server2.test.com  127.0.0.1
    in your hosts file. See the Readme for details.

    Certificates for this example are self-signed.
    The browser will warn of this when connected and
    the output log will warn of client errors.
    See the Readme for more information.

    Statistics can be viewed from http://localhost:3001

    If you get a 404 Not Found for the statistics page, 
    exit the server and run it from the root of the project.
    Or run 'npm start' from the root of the project
  `
)

server1.start()
server2.start()

const proxy = new HttpReverseProxy(httpReverseProxyOptions, LetsEncryptUsingSelfSigned)

proxy.addRoute('https://server1.test.com', 'localhost:8001', routingOptions)
proxy.addRoute('https://server2.test.com', 'localhost:8002', routingOptions)

logger.info(null, 'Https Reverse Proxy server started')

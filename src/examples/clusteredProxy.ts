import cluster from 'cluster'
import { HttpReverseProxy } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'
import { Statistics } from '../lib/statistics'
import { StatisticsServer, StatisticsServerOptions } from '../lib/statisticsServer'
import { Logger } from '../lib/logger'

const stats = new Statistics()
let logger: Logger

if (cluster.isMaster) {

  const statisticsServerOptions: StatisticsServerOptions = {

    stats: stats,
    htmlFilename: './public/statisticsAndLoggingPage.html'
  }

  const server1 = new SimpleHttpServer(1, 8001)
  const server2 = new SimpleHttpServer(2, 8002)

  const statisticsServer = new StatisticsServer(statisticsServerOptions)

  logger = new Logger(
    {
      port: 3002,
      logLevel: 10
    }
  )

  logger.warn(null,
    `ClusteredProxy:
    Make sure you have:
      server1.qzqzqz.com  127.0.0.1
      server2.qzqzqz.com  127.0.0.1
    in your hosts file. See the Readme for details.

    Statistics and logs can be viewed from http://localhost:3001

    If you get a 404 Not Found for the statistics page, 
    exit the server and run it from the root of the project.
    Or run 'npm run clusteredExample' from the root of the project
  `
  )

  server1.start()
  server2.start()
}
else {

  logger = new Logger()
}

const proxy = new HttpReverseProxy({ clustered: true, stats: stats, log: logger })

proxy.addRoute('http://server1.qzqzqz.com', 'localhost:8001')
proxy.addRoute('http://server2.qzqzqz.com', 'localhost:8002')

logger.info(null, 'Proxy server started')

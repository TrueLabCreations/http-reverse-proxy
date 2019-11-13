import { HttpReverseProxy } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'
import { Statistics } from '../lib/statistics'
import { StatisticsServer, StatisticsServerOptions } from '../lib/statisticsServer'
import { SimpleLogger } from './simpleLogger'

const stats = new Statistics()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsPage.html'
}

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

const statisticsServer = new StatisticsServer(statisticsServerOptions)
const logger = new SimpleLogger()

logger.warn(null,
  `SimpleHttpProxy:
    Make sure you have:
      server1.test.com  127.0.0.1
      server2.test.com  127.0.0.1
    in your hosts file. See the Readme for details.

    Statistics can be viewed from http://localhost:3001

    If you get a 404 Not Found for the statistics page, 
    exit the server and run it from the root of the project.
    Or run 'npm start' from the root of the project
  `
)

server1.start()
server2.start()

const proxy = new HttpReverseProxy({ stats: stats, log: logger })

proxy.addRoute('http://server1.test.com', 'localhost:8001')
proxy.addRoute('http://server2.test.com', 'localhost:8002')

logger.info(null,'Proxy server started')

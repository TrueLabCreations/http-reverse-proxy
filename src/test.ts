import cluster from 'cluster'
import { HttpReverseProxy } from './lib/httpReverseProxy'
import { SimpleHttpServer } from './examples/simpleHttpServer'
import { SimpleLogger } from './examples/simpleLogger'
import { Statistics } from './lib/statistics'
import { StatisticsServer } from './lib/statisticsServer'

const statistics = new Statistics()

if (cluster.isMaster) {
  const statisticsServer = new StatisticsServer({ stats: statistics })

  new SimpleHttpServer(1, 8001).start()
  new SimpleHttpServer(2, 8002).start()
}
new HttpReverseProxy({ clustered: true, log: new SimpleLogger(), stats: statistics })
  .addRoute('server1.test.com', 'localhost:8001')
  .addRoute('server2.test.com', 'localhost:8002')
import HTTPReverseProxy, { HttpReverseProxyOptions } from '../src/httpReverseProxy'
import Statistics from '../src/statistics'
import StatisticsServer, { StatisticsServerOptions } from '../src/statisticsServer'

const statistics = new Statistics()

const statisticsOptions: StatisticsServerOptions = {

  stats: statistics,

  http: {

    port: 3001
  },
  websocket: {

    updateInterval: 1000,
    // filter: ['Active', 'Route']
  }
}

const httpProxyOptions: HttpReverseProxyOptions = {

  proxyOptions: {
  
    xfwd: true,
    // agent: false,
  },
  stats: statistics
}

let statisticsServer: StatisticsServer = null
let proxy: HTTPReverseProxy = null

export const startProxy = () => {

  statisticsServer = new StatisticsServer(statisticsOptions)
  proxy = new HTTPReverseProxy(httpProxyOptions)

  proxy.addRoute('server9.test.com', 'localhost:3001')
  proxy.addRoute('server1.test.com', 'localhost:9001')
  proxy.addRoute('server2.test.com', 'localhost:9002')
  proxy.addRoute('server3.test.com', 'localhost:9003')
  proxy.addRoute('server3.test.com', 'localhost:9003')
  proxy.addRoute('server1.test.com/testing', 'localhost:9001')
  proxy.addRoute('server2.test.com/testing', 'localhost:9002')
  proxy.addRoute('server3.test.com/testing', 'localhost:9003')
  proxy.addRoute('server1.test.com/test', '127.0.0.1:9001/test')
  proxy.addRoute('server2.test.com/test', '127.0.0.1:9002/test')
  proxy.addRoute('server3.test.com/test', '127.0.0.1:9003/test')
  proxy.addRoute('server4.test.com', 'server3.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server5.test.com', 'server4.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server6.test.com', 'server5.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server7.test.com', 'server6.test.com', { useTargetHostHeader: true })
}

export const stopProxy = () => {
  proxy && proxy.close()
  statisticsServer && statisticsServer.stop()
}


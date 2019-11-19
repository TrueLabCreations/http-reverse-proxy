import {
  HttpReverseProxy,
  HttpReverseProxyOptions,
  Certificates,
  Statistics,
  StatisticsServer,
  StatisticsServerOptions,
  LetsEncryptSelfSignedOptions,
  RegistrationHttpsOptions,
  RouteRegistrationOptions,
  LetsEncryptUsingSelfSigned,
  Logger,
  RegistrationLetsEncryptOptions
} from '../index'

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

const letsEncryptSelfSignedOptions: LetsEncryptSelfSignedOptions = {

  organizationName: 'Self Signed Testing',
  country: 'US',
  state: 'Georgia',
  locality: 'Roswell',
}


const httpProxyOptions: HttpReverseProxyOptions = {

  proxyOptions: {

    xfwd: false,
  },

  httpsOptions: {

    certificates: new Certificates({ certificateStoreRoot: '../certificates' }),
  },

  letsEncryptOptions: letsEncryptSelfSignedOptions,

  log: new Logger(),

  stats: statistics
}

const registrationLetsEncryptOptions: RegistrationLetsEncryptOptions ={
  email: "tom@swiedler.com",
  production: false,
  forceRenew: true

}

const httpsRouteRegistrationOptions: RouteRegistrationOptions = {

  secureOutbound: false,
  useTargetHostHeader: true,
  https: {

    redirectToHttps: true,

    letsEncrypt: registrationLetsEncryptOptions
  }
}

let statisticsServer: StatisticsServer = null
let proxy: HttpReverseProxy = null

export const startProxy = () => {

  statisticsServer = new StatisticsServer(statisticsOptions)
  proxy = new HttpReverseProxy(httpProxyOptions, LetsEncryptUsingSelfSigned)

  proxy.addRoute('server9.test.com', 'localhost:3001')
  proxy.addRoute('server1.test.com', 'localhost:9001')
  proxy.addRoute('server2.test.com', 'localhost:9002')
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
  proxy.addRoute('server7.test.com', 'server6.test.com', httpsRouteRegistrationOptions)
}

export const stopProxy = () => {
  proxy && proxy.close()
  statisticsServer && statisticsServer.stop()
}

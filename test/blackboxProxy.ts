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

    certificates: new Certificates({ certificateStoreRoot: './certificates' }),
  },

  letsEncryptOptions: letsEncryptSelfSignedOptions,

  log: new Logger({

    port: 3002,
    logLevel: 40
  }),

  stats: statistics
}

const registrationLetsEncryptOptions: RegistrationLetsEncryptOptions ={
  email: "myname@mydomain.com",
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

  proxy.addRoute('server9.qzqzqz.com', 'localhost:3001')
  proxy.addRoute('server1.qzqzqz.com', 'localhost:9001')
  proxy.addRoute('server2.qzqzqz.com', 'localhost:9002')
  proxy.addRoute('server3.qzqzqz.com', 'localhost:9003')
  proxy.addRoute('server1.qzqzqz.com/testing', 'localhost:9001')
  proxy.addRoute('server2.qzqzqz.com/testing', 'localhost:9002')
  proxy.addRoute('server3.qzqzqz.com/testing', 'localhost:9003')
  proxy.addRoute('server1.qzqzqz.com/test', '127.0.0.1:9001/test')
  proxy.addRoute('server2.qzqzqz.com/test', '127.0.0.1:9002/test')
  proxy.addRoute('server3.qzqzqz.com/test', '127.0.0.1:9003/test')
  proxy.addRoute('server4.qzqzqz.com', 'server3.qzqzqz.com', { useTargetHostHeader: true })
  proxy.addRoute('server5.qzqzqz.com', 'server4.qzqzqz.com', { useTargetHostHeader: true })
  proxy.addRoute('server6.qzqzqz.com', 'server5.qzqzqz.com', { useTargetHostHeader: true })
  proxy.addRoute('server7.qzqzqz.com', 'server6.qzqzqz.com', httpsRouteRegistrationOptions)
}

export const stopProxy = () => {
  proxy && proxy.close()
  statisticsServer && statisticsServer.stop()
  httpProxyOptions.log && httpProxyOptions.log.close()
}

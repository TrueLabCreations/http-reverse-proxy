import http from 'http'
import https from 'https'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'

chai.use(chaiAsPromised)

import HTTPReverseProxy, { HTTPReverseProxyOptions } from '../httpReverseProxy'

export class HTTPReverseProxyTest extends HTTPReverseProxy {
  constructor(options: HTTPReverseProxyOptions) {
    super(options)
  }

  private server1 = null
  private server2 = null

  public startServers = () => {
    this.server1 = http.createServer((req, res) => {
      res.end(`Test succeeded. Port 9001. URL:${req.url}`)
    }).listen(9001)

    this.server2 = http.createServer((req, res) => {
      res.end('Test succeeded. Port 9002')
    }).listen(9002)
  }

  public stopServers = () => {
    this.server1 && this.server1.close()
    this.server2 && this.server2.close()
  }

}
import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import net from 'net'
import cluster from 'cluster'
import os from 'os'
import { SecureContext } from 'tls'
import Certificates, { CertificateOptions, CertificateMessage } from './certificates'
import BaseLetsEncryptClient, { BaseLetsEncryptOptions, LetsEncryptMessage } from './letsEncrypt'
import LetsEncryptUsingAcmeClient, { LetsEncryptClientOptions } from './letsEncryptUsingAcmeClient'
import HTTPRouter, { ExtendedIncomingMessage, RouteRegistrationOptions, HTTPRouterOptions } from './httpRouter'
import { LoggerInterface } from './simpleLogger'
import { ProxyUrl, makeUrl, respondNotFound } from './util'
import Statistics, { StatisticsMessage } from './statistics'

export interface ClusterMessage {
  messageType: string
  action: string
}

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm?: boolean
}

export interface HTTPReverseProxyOptions {
  port?: number
  host?: string  // TO DO make this an array of strings or interface options
  proxyOptions?: ExtendedProxyOptions
  httpsOptions?: HttpsServerOptions
  clustered?: boolean | number
  letsEncryptOptions?: BaseLetsEncryptOptions
  preferForwardedHost?: boolean,
  log?: LoggerInterface
  stats?: Statistics
}

export interface HttpsServerOptions {
  port?: number
  certificates: Certificates | CertificateOptions
  host?: string  // TO DO make this an array of strings or interface options
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  httpsServerOptions?: https.ServerOptions
}

type HTTPRouters = {
  [host: string]: HTTPRouter
}

const defaultProxyOptions: ExtendedProxyOptions = {
  ntlm: false,
  prependPath: false,
  secure: true,
}

const defaultHttpOptions: HTTPReverseProxyOptions = {
  port: 80,
  proxyOptions: defaultProxyOptions,
  httpsOptions: null,
  preferForwardedHost: false,
}

const defaultHttpsOptions: HttpsServerOptions = {
  port: 443,
  certificates: { certificateStoreRoot: '../certificates' }
}

export default class HTTPReverseProxy {

  protected options: HTTPReverseProxyOptions;
  protected isMaster: boolean
  protected proxy: httpProxy
  protected server: http.Server // TO DO make this an array
  protected httpsOptions: HttpsServerOptions
  protected httpsServer: https.Server // TO DO make this an array
  protected certificates: Certificates
  protected letsEncrypt: BaseLetsEncryptClient
  protected routers: HTTPRouters
  protected log: LoggerInterface
  protected stats: Statistics

  constructor(
    options?: HTTPReverseProxyOptions,
    letsEncrypt: typeof BaseLetsEncryptClient = LetsEncryptUsingAcmeClient) {

    this.options = options = { ...defaultHttpOptions, ...options }

    this.log = options.log
    this.stats = options.stats


    if (this.options.clustered && cluster.isMaster) {

      this.runClusterMaster()
    }
    else {

      this.runServer(options, letsEncrypt)
    }
  }

  private handleWorkerExit = (worker: cluster.Worker, code: number, signal: string) => {

    this.log && this.log.error({ id: worker.id }, `Worker died with code ${code}. Signal ${signal}.`)

    this.stats && this.stats.updateCount('WorkersStopped', 1)
    this.stats && this.stats.updateCount('WorkersRunning', -1)

    if (worker.exitedAfterDisconnect !== true && 'SIGKILL' !== signal) {

      this.log && this.log.info({ id: worker.id }, 'Restarting...')

      this.stats && this.stats.updateCount('WorkersRestarted', 1)

      cluster.fork()
    }
  }

  private handleWorkerOnline = (worker: cluster.Worker) => {

    this.stats && this.stats.updateCount('WorkersStarted', 1)
    this.stats && this.stats.updateCount('WorkersRunning', 1)

    this.log && this.log.info({ id: worker.id }, 'Worker is online')
  }

  private handleWorkerMessage = (worker: cluster.Worker, message: ClusterMessage) => {

    switch (message.messageType) {

      case 'statistics':

        if (this.stats) {

          this.stats.processMessage(message as StatisticsMessage)
        }

        break

      case 'letsEncrypt':
      case 'certificate':

        for (const workerId in cluster.workers) {

          cluster.workers[workerId].send(message)
        }

        break

      default:

        break
    }
  }

  private runClusterMaster = () => {

    this.isMaster = true

    let workerCount = os.cpus().length

    if ('number' === typeof this.options.clustered) {

      workerCount = this.options.clustered
    }

    if (workerCount > 32) {

      workerCount = 32
    }

    if (workerCount < 2) {

      workerCount = 2
    }

    while (workerCount--) {

      cluster.fork()
    }

    cluster.on('online', this.handleWorkerOnline)

    cluster.on('exit', this.handleWorkerExit)

    cluster.on('message', this.handleWorkerMessage)
  }

  private handleServerMessage = (message: ClusterMessage) => {

    switch (message.messageType) {

      case 'letsEncrypt':

        this.letsEncrypt && this.letsEncrypt.processMessage(message as LetsEncryptMessage)

        break

      case 'certificate':

        this.certificates && this.certificates.processMessage(message as CertificateMessage)

        break

      default:

        break
    }
  }

  private runServer = (options: HTTPReverseProxyOptions,
    letsEncrypt: typeof BaseLetsEncryptClient) => {

    if (cluster.isWorker) {

      process.on('disconnect', () => {

        this.close()
      })

      process.on('message', this.handleServerMessage)
    }

    this.routers = {}

    this.proxy = this.createProxyServer({ ...defaultProxyOptions, ...options.proxyOptions })
    this.server = this.setupHttpServer(options)

    if (options.httpsOptions) {

      this.httpsOptions = { ...defaultHttpsOptions, ...options.httpsOptions }

      this.certificates =
        this.httpsOptions.certificates instanceof Certificates
          ? this.httpsOptions.certificates
          : new Certificates({ log: this.log, stats: this.stats, ...this.httpsOptions.certificates })

      this.httpsOptions.host = this.httpsOptions.host || options.host

      this.httpsServer = this.setupHttpsServer(this.httpsOptions)

      if (options.letsEncryptOptions) {

        const letsEncryptOptions: LetsEncryptClientOptions = {

          // dnsChallenge: configOptions.dnsUpdate,

          certificates: this.certificates,
          log: this.log,
          stats: this.stats,
          ...options.letsEncryptOptions
        }

        this.letsEncrypt = new letsEncrypt(letsEncryptOptions)
      }
    }
  }

  public addRoute = (
    from: string | Partial<URL>,
    to: string | ProxyUrl | (string | ProxyUrl)[],
    registrationOptions?: RouteRegistrationOptions) => {

    if (this.isMaster) {

      /**
       * we do not add the routes to the master. It does no routing
       */
      return this
    }

    if (!from || !to || (Array.isArray(to) && to.length === 0)) {

      throw Error('Cannot add a new route with unspecified "from" or "to"')
    }

    from = makeUrl(from)

    let router = this.routers[from.hostname]

    if (!router) {

      const options: HTTPRouterOptions = {

        proxy: this.proxy,
        log: this.log,
        stats: this.stats,
      }

      if (registrationOptions && registrationOptions.https) {

        options.certificates = this.certificates
        options.https = registrationOptions.https
        options.redirectPort = this.httpsOptions.port

        if (registrationOptions.https.letsEncrypt) {

          options.letsEncrypt = this.letsEncrypt
        }
      }

      router = new HTTPRouter(from.hostname, options)

      this.routers[from.hostname] = router

      this.stats && this.stats.updateCount('ActiveRouters', 1)
    }

    router.addRoute(from, to, registrationOptions)

    if (router.noRoutes()) {

      delete this.routers[from.hostname]
      this.certificates && this.certificates.removeCertificate(from.hostname)

      this.stats && this.stats.updateCount('ActiveRouters', -1)
      this.stats && this.stats.updateCount('MalformedRoutes', 1)

      throw Error('Cannot add a new route with unspecified "from" or "to"')
    }

    this.stats && this.stats.updateCount('RoutesAdded', 1)
  }

  public removeRoute = (from: string | Partial<URL>, to?: string | ProxyUrl | (string | ProxyUrl)[]) => {

    if (this.isMaster) {

      /**
       * We do not add or remove routes from the master. It does not route.
       */
      return this
    }

    from = makeUrl(from)

    const router = this.routers[from.hostname]

    if (router) {

      router.removeRoute(from, to)

      if (router.noRoutes()) {

        delete this.routers[from.hostname]
        this.certificates && this.certificates.removeCertificate(from.hostname)

        this.stats && this.stats.updateCount('ActiveRouters', -1)
        this.stats && this.stats.updateCount('RoutersRemoved', 1)
      }

      this.stats && this.stats.updateCount('RoutesRemoved', 1)
    }
  }

  protected createProxyServer(proxyOptions: ExtendedProxyOptions): httpProxy {

    const proxy = httpProxy.createProxyServer(proxyOptions)

    proxy.on('proxyReq', (clientRequest: http.ClientRequest, req: http.IncomingMessage) => {

      if (req.headers.host !== null) {

        clientRequest.setHeader('host', req.headers.host)
      }

      this.stats && this.stats.updateCount('ProxyRequests', 1)
    })

    if (proxyOptions.ntlm) {

      proxy.on('proxyReq', (request: http.ClientRequest) => {

        const key = 'www-authenticate'
        request.setHeader(key, request.getHeader(key) && (request.getHeader(key) as string).split(','))
      })
    }

    proxy.on('error', (error, req, res, target) => {

      respondNotFound(req, res)

      this.log && this.log.error({ error: error, target: target }, 'HTTP Proxy Error')
      this.stats && this.stats.updateCount('HttpProxyErrors', 1)
    })

    return proxy
  }

  protected setupHttpServer = (options: HTTPReverseProxyOptions): http.Server => {

    const server = http.createServer()

    server.on('request',

      (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

        const hostName = this.getInboundHostname(req);
        const router = this.routers[hostName]

        if (router) {

          router.routeHttp(req, res)
        }
        else {

          respondNotFound(req, res)

          this.stats && this.stats.updateCount('HttpMissingRoutes', 1)
        }

        this.stats && this.stats.updateCount('HttpRequests', 1)
      });

    //
    // Listen to the `upgrade` event and proxy the
    // WebSocket requests as well.
    //
    server.on('upgrade', this.websocketsUpgrade)

    server.on('error', function (err) {

      this.log && this.log.error(err, 'Server Error')

      this.stats && this.stats.updateCount('HttpErrors', 1)
    });

    server.on('clientError', function (error, socket) {

      socket.end('HTTP/1.1 400 Bad Request')

      this.log && this.log.error(error, 'HTTP Client Error')
      this.stats && this.stats.updateCount('HttpClientErrors', 1)
    });

    server.on('listening', () => {

      this.log && this.log.info(server.address(), `HTTP server listening`);
    })

    server.listen(options.port, options.host)

    return server
  }

  protected setupHttpsServer = (httpsOptions: HttpsServerOptions): https.Server => {

    const httpsServerOptions: https.ServerOptions = {

      SNICallback: (hostname: string, cb: (error: Error, ctx: SecureContext) => void) => {
        if (cb) {
          cb(null, this.certificates.getCertificate(hostname))
        }
        else {
          return this.certificates.getCertificate(hostname)
        }
      },

      key: this.certificates.getCertificateData(httpsOptions.keyFilename, false),
      cert: this.certificates.getCertificateData(httpsOptions.certificateFilename, false),
      ca: this.certificates.getCertificateData(httpsOptions.caFilename, true),
    }

    if (httpsOptions.httpsServerOptions) {

      Object.assign(httpsServerOptions, httpsOptions.httpsServerOptions)
    }

    const httpsServer: https.Server = https.createServer(httpsServerOptions)

    httpsServer.on('request',

      (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

        const hostName = this.getInboundHostname(req);
        const router = this.routers[hostName]

        if (router) {

          router.routeHttps(req, res)
        }
        else {

          respondNotFound(req, res)

          this.stats && this.stats.updateCount('HttpsMissingRoutes', 1)
        }

        this.stats && this.stats.updateCount('HttpsRequests', 1)
      });

    //   //
    //   // Listen to the `upgrade` event and proxy the
    //   // WebSocket requests as well.
    //   //
    httpsServer.on('upgrade', this.websocketsUpgrade);

    httpsServer.on('error', function (err: Error) {

      this.log && this.log.error(err, 'HTTPS Server Error')

      this.stats && this.stats.updateCount('HttpsErrors', 1)
    });

    httpsServer.on('clientError', function (error, socket) {

      socket.end('HTTP/1.1 400 Bad Request')

      this.log && this.log.error(error, 'HTTPS Client Error')
      this.stats && this.stats.updateCount('HttpsClientErrors', 1)
    });

    httpsServer.on('listening', () => {

      this.log && this.log.info(httpsServer.address(), `HTTPS server listening`)
    })

    httpsServer.listen(httpsOptions.port, httpsOptions.host);

    return httpsServer;
  }

  protected getInboundHostname = (req: http.IncomingMessage): string => {

    if (this.options.preferForwardedHost === true) {

      const forwardedHost = req.headers['x-forwarded-host']

      if (Array.isArray(forwardedHost)) {

        return forwardedHost[0].split(':')[0]
      }

      if (forwardedHost)

        return forwardedHost.split(':')[0];
    }

    if (req.headers.host) {

      return req.headers.host.split(':')[0];
    }
  }

  protected websocketsUpgrade = (req: ExtendedIncomingMessage, socket: net.Socket, head: Buffer | null) => {

    socket.on('error', function (err) {

      this.log && this.log.error(err, 'WebSockets error')

      // socket.end('HTTP/1.1 400 Bad Request')

      this.stats && this.stats.updateCount('WebsocketErrors', 1)
    });

    const hostname = this.getInboundHostname(req);
    const router = this.routers[hostname]

    if (router) {

      const target = router.getTarget(req)
      this.log && this.log.info({ from: hostname, target: target.host }, 'upgrade to websockets')

      if (target) {
        try {

          this.proxy.ws(req, socket, head, { target: target, secure: target.secure })

          this.stats && this.stats.updateCount('WebsocketUpgradeRequests', 1)
        }
        catch (err) {

          socket.end('HTTP/1.1 400 Bad Request')

          this.stats && this.stats.updateCount('WebsocketProxyErrors', 1)
        }
      }
      else {

        socket.end('HTTP/1.1 400 Bad Request')

        this.stats && this.stats.updateCount('WebsocketUpgradeNoTarget', 1)
      }
    }
    else {

      socket.end('HTTP/1.1 400 Bad Request')

      this.stats && this.stats.updateCount('WebsocketUpgradeNoRoute', 1)
    }
  }

  public close = () => {

    try {

      if (this.isMaster) {

        const workerIds = Object.keys(cluster.workers)

        workerIds.forEach((id) => {

          cluster.workers[id].disconnect()
        })
      }
      else {

        this.server.close()
        this.httpsServer && this.httpsServer.close()
        this.letsEncrypt && this.letsEncrypt.close()
      }
    } catch (err) {
      // Ignore for now...
    }
  }
}

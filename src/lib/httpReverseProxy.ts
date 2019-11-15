import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import net from 'net'
import cluster from 'cluster'
import os from 'os'
import { SecureContext } from 'tls'
import { Certificates, CertificateOptions, CertificateMessage } from './certificates'
import { BaseLetsEncryptClient, BaseLetsEncryptOptions, LetsEncryptMessage } from './letsEncrypt/letsEncrypt'
import { LetsEncryptUsingAcmeClient, LetsEncryptClientOptions } from './letsEncrypt/letsEncryptUsingAcmeClient'
import { HttpRouter, ExtendedIncomingMessage, RouteRegistrationOptions, HttpRouterOptions } from './httpRouter'
import { SimpleLogger } from '../examples/simpleLogger'
import { ProxyUrl, makeUrl, respondNotFound } from './util'
import { Statistics, StatisticsMessage } from './statistics'


/**
 * This is the base message type for a clustered environment.
 * 
 * Messages from other parts of the system inherit from this
 * 
 * Messages are passed both ways from the master to the workers 
 */

export interface ClusterMessage {
  messageType: string
  action: string
}

/**
 * A minor extension to the http-proxy options to handle NTLM credentials
 */

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm?: boolean
}

/**
 * Startup options for the http server on the front side of the proxy
 */

export interface HttpReverseProxyOptions {
  port?: number   // The http server port. default 80 
  host?: string   // The network interface ip for http to listen on. default all
  proxyOptions?: ExtendedProxyOptions // The options for the http-proxy
  httpsOptions?: HttpsServerOptions   // Options for the https server
  clustered?: boolean | number        // Set up a clustered enviroment
  letsEncryptOptions?: BaseLetsEncryptOptions // Global options for the lets enrypt server
  preferForwardedHost?: boolean       // Should the proxy use the hostname or the x-farwarded host name
  log?: SimpleLogger | null
  stats?: Statistics
}

/**
 * Startup options for the https server on the front side of the reverse proxy
 */

export interface HttpsServerOptions {
  port?: number   // the https server port. default: 443 
  certificates: Certificates | CertificateOptions // The required Certificate table instance or options to instantiate a Certificate table
  host?: string   // The network interface ip for https to listen on. Default all/http interface
  keyFilename?: string    // The default key file in PEM format
  certificateFilename?: string  // The default certificate file in PEM format
  caFilename?: string           // The default ca file in PEM format
  httpsServerOptions?: https.ServerOptions  // Options to be passed to the https server
}

/**
 * The table of routers. Each router is identified by the inbound host name
 */

type HttpRouters = {
  [host: string]: HttpRouter
}

/**
 * The default options for the http-proxy
 */

const defaultProxyOptions: ExtendedProxyOptions = {
  ntlm: false,
  prependPath: false,
  secure: true,
}

/**
 * The default options for the http server
 */

const defaultHttpOptions: HttpReverseProxyOptions = {
  port: 80,
  proxyOptions: defaultProxyOptions,
  httpsOptions: null,
  preferForwardedHost: false,
}

/**
 * The default options for the https server
 */

const defaultHttpsOptions: HttpsServerOptions = {
  port: 443,
  certificates: { certificateStoreRoot: '../certificates' }
}

/**
 * The main Http(s) Reverse Proxy implementation
 */

export class HttpReverseProxy {

  protected options: HttpReverseProxyOptions;
  protected isMaster: boolean
  protected proxy: httpProxy
  protected server: http.Server
  protected httpsOptions: HttpsServerOptions
  protected httpsServer: https.Server
  protected certificates: Certificates
  protected letsEncrypt: BaseLetsEncryptClient
  protected routers: HttpRouters
  protected log: SimpleLogger
  protected stats: Statistics

  /**
   * The constructor is passed a set of http options. 
   * If no options are passed the default options are used.
   * 
   * The second parameter is the type of the Lets Encrypt implementation to use.
   * The default is LetsEncryptUsingAcmeClient
   */

  constructor(
    options?: HttpReverseProxyOptions,
    letsEncrypt: typeof BaseLetsEncryptClient = LetsEncryptUsingAcmeClient) {

    this.options = options = { ...defaultHttpOptions, ...options }

    this.log = options.log
    this.stats = options.stats

    if (this.options.clustered && cluster.isMaster) {

      /**
       * The cluster master will fork the children, monitor them, and route messages
       */

      this.runClusterMaster()
    }
    else {

      /**
       * If it is not a master, it is either a single server of a worker.
       */

      this.runServer(options, letsEncrypt)
    }
  }

  /**
   * Helper method to manage premature worker exit
   */

  private handleWorkerExit = (worker: cluster.Worker, code: number, signal: string) => {

    this.log && this.log.error({ id: worker.id }, `Worker died with code ${code}. Signal ${signal}.`)

    this.stats && this.stats.updateCount('WorkersStopped', 1)
    this.stats && this.stats.updateCount('WorkersRunning', -1)

    /**
     * If the worker died unexpectedly, restart it
     */

    if (worker.exitedAfterDisconnect !== true && 'SIGKILL' !== signal) {

      this.log && this.log.info({ id: worker.id }, 'Restarting...')

      this.stats && this.stats.updateCount('WorkersRestarted', 1)

      /**
       * Start a new worker
       */

      cluster.fork()
    }
  }

  /**
   * Helper method to keep track of the workers who are active
   */

  private handleWorkerOnline = (worker: cluster.Worker) => {

    this.stats && this.stats.updateCount('WorkersStarted', 1)
    this.stats && this.stats.updateCount('WorkersRunning', 1)

    this.log && this.log.info({ id: worker.id }, 'Worker is online')
  }

  /**
   * Helper Method to handle messages from the workers
   * 
   * Messages are used to keep statitics and the state of the certificates and challenges in sync
   */

  private handleWorkerMessage = (worker: cluster.Worker, message: ClusterMessage) => {

    switch (message.messageType) {

      /**
       * For a staatistics message hand it to the master statistics class
       */

      case 'statistics':

        if (this.stats) {

          this.stats.processMessage(message as StatisticsMessage)
        }

        break

      /**
       * For the LetsEncrypt challenges and certificates send them out to each worker
       */

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

  /**
   * The cluster master process. Provides forking, monitoring and messaging for the workers
   */

  private runClusterMaster = () => {

    this.isMaster = true

    /**
     * The default worker count is the number of cores on the cpu
     */

    let workerCount = os.cpus().length

    if ('number' === typeof this.options.clustered) {

      workerCount = this.options.clustered
    }

    /**
     * Keep the number of workers rational
     */

    if (workerCount > 32) {

      workerCount = 32
    }

    if (workerCount < 2) {

      workerCount = 2
    }

    /**
     * The initial start of the workers. Workers will execute the runServer method
     */

    while (workerCount--) {

      cluster.fork()
    }

    cluster.on('online', this.handleWorkerOnline)

    cluster.on('exit', this.handleWorkerExit)

    cluster.on('message', this.handleWorkerMessage)
  }

  /**
   * Helper method for the workers to process messages from the master
   */

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

  /**
   *  The primary process of the reverse proxy server 
  */

  private runServer = (options: HttpReverseProxyOptions,
    letsEncrypt: typeof BaseLetsEncryptClient) => {

    /**
     * A clustered worker needs to handle disconnects and messages
     */

    if (cluster.isWorker) {

      process.on('disconnect', () => {

        this.close()
      })

      process.on('message', this.handleServerMessage)
    }

    /**
     * Create the table of HTTPRouters
     */

    this.routers = {}

    /**
     * Start the http-proxy
     */

    this.proxy = this.createProxyServer({ ...defaultProxyOptions, ...options.proxyOptions })

    /**
     * Start the http server
     */

    this.server = this.setupHttpServer(options)

    /**
     * Check to see if the configuration includes an https server
     */

    if (options.httpsOptions) {

      this.httpsOptions = { ...defaultHttpsOptions, ...options.httpsOptions }

      /**
       * Capture or create the Certificates table
       */

      this.certificates =
        this.httpsOptions.certificates instanceof Certificates
          ? this.httpsOptions.certificates
          : new Certificates({ log: this.log, stats: this.stats, ...this.httpsOptions.certificates })

      /**
       * Set the network interface for the https listen
       */

      this.httpsOptions.host = this.httpsOptions.host || options.host

      /**
       * Start the https server
       */

      this.httpsServer = this.setupHttpsServer(this.httpsOptions)

      /**
       * Check to see if a LetsEncrypt server should be started
       */

      if (options.letsEncryptOptions) {

        const letsEncryptOptions: LetsEncryptClientOptions = {

          certificates: this.certificates,
          log: this.log,
          stats: this.stats,
          ...options.letsEncryptOptions
        }

        /**
         * Start the letsEncrypt server from the type passed in
         */

        this.letsEncrypt = new letsEncrypt(letsEncryptOptions)
      }
    }
  }

  /**
   * Add a new route to the system. If this is for a new host create a new HttpRouter.
   * 
   * Add the targets to the router
   */

  public addRoute = (
    from: string | Partial<URL>,
    to: string | ProxyUrl | (string | ProxyUrl)[],
    registrationOptions?: RouteRegistrationOptions
  ): HttpReverseProxy => {

    if (this.isMaster) {

      /**
       * we do not add the routes to the master. It does no routing
       */
      return this
    }

    if (!from || !to || (Array.isArray(to) && to.length === 0)) {

      throw Error('Cannot add a new route with unspecified "from" or "to"')
    }

    /**
     * Extract a Url from the source
     */

    from = makeUrl(from)

    /**
     * See if there is already an HttpRouter serving the host
     */

    let router = this.routers[from.hostname]

    if (!router) {

      /**
       * Create a new instance of an HttpRouter
       */

      const options: HttpRouterOptions = {

        proxy: this.proxy,
        log: this.log,
        stats: this.stats,
      }

      /**
       * Set up the https parameters if https is specified in the registeration options
       */

      if (registrationOptions && registrationOptions.https) {

        options.certificates = this.certificates
        options.https = registrationOptions.https
        options.redirectPort = this.httpsOptions.port

        /**
         * If we are using LetsEncrypt, set up access to the server
         */

        if (registrationOptions.https.letsEncrypt) {

          options.letsEncrypt = this.letsEncrypt
        }
      }

      /** 
       * Create a new HttpRouter 
      */

      router = new HttpRouter(from.hostname, options)

      /**
       * Add it to the table
       */

      this.routers[from.hostname] = router

      this.stats && this.stats.updateCount('ActiveRouters', 1)
    }

    /**
     * Add the targets to the router
     */

    router.addRoute(from, to, registrationOptions)

    /**
     * Check if all of the targets fail due to option issues
     */

    if (router.noRoutes()) {

      /**
       * Remove the HttpRouter from the table
       */

      delete this.routers[from.hostname]

      this.certificates && this.certificates.removeCertificate(from.hostname)

      this.stats && this.stats.updateCount('ActiveRouters', -1)
      this.stats && this.stats.updateCount('MalformedRoutes', 1)

      /**
       * Error if the configuration is wrong
       */

      this.log && this.log.fatal({ hostname: from.hostname, targets: to }, 'Cannot add a new route with unspecified "from" or "to"')
    }

    this.stats && this.stats.updateCount('RoutesAdded', 1)

    return this
  }

  /**
   * Remove route(s) from an HttpRouter
   */

  public removeRoute = (
    from: string | Partial<URL>,
    to?: string | ProxyUrl | (string | ProxyUrl)[]
  ): HttpReverseProxy => {

    if (this.isMaster) {

      /**
       * We do not add or remove routes from the master. It does not route.
       */
      return this
    }

    /**
     * Extract a Url from the source
     */

    from = makeUrl(from)

    const router = this.routers[from.hostname]

    /**
     * If we have a matching router in the table, work with it
     */

    if (router) {

      /**
       * Remove the targets. If "to" is null, remove them all
       */

      router.removeRoute(from, to)

      /**
       * If the router has no Routes, remove it
       */

      if (router.noRoutes()) {

        delete this.routers[from.hostname]
        this.certificates && this.certificates.removeCertificate(from.hostname)

        this.stats && this.stats.updateCount('ActiveRouters', -1)
        this.stats && this.stats.updateCount('RoutersRemoved', 1)
      }

      this.stats && this.stats.updateCount('RoutesRemoved', 1)
    }

    return this
  }

  /**
   * Start the http-proxy service
   */

  protected createProxyServer(proxyOptions: ExtendedProxyOptions): httpProxy {

    const proxy = httpProxy.createProxyServer(proxyOptions)

    /**
     * Handle some housekkeeping on proxy requests
     */

    proxy.on('proxyReq', (clientRequest: http.ClientRequest, req: http.IncomingMessage) => {

      if (req.headers.host !== null) {

        clientRequest.setHeader('host', req.headers.host)
      }

      this.stats && this.stats.updateCount('ProxyRequests', 1)
    })

    if (proxyOptions.ntlm) {

      proxy.on('proxyReq', (request: http.ClientRequest) => {

        /**
         * Parse out the credentials for NTLM
         */

        const key = 'www-authenticate'
        request.setHeader(key, request.getHeader(key) && (request.getHeader(key) as string).split(','))
      })
    }

    /**
     * Do something graceful when there is an error
     */

    proxy.on('error', (error, req, res, target) => {

      respondNotFound(req, res)

      this.log && this.log.error({ error: error, target: target }, 'Http Proxy Error')
      this.stats && this.stats.updateCount('HttpProxyErrors', 1)
    })

    return proxy
  }

  /**
   * Start the http server
   */

  protected setupHttpServer = (options: HttpReverseProxyOptions): http.Server => {

    const server = http.createServer()

    server.on('request',

      (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

        /**
         * Get the host name from the request and use it to find the proper router
         */

        const hostName = this.getInboundHostname(req);
        const router = this.routers[hostName]

        if (router) {

          /**
           * Pass the heavy lifting to the router
           */

          router.routeHttp(req, res)
        }
        else {

          /**
           * Gracefully respond to bots and hacks...
           */

          respondNotFound(req, res)

          this.log && this.log.warn({ url: req.url }, "Missing route")

          this.stats && this.stats.updateCount('HttpMissingRoutes', 1)
        }

        this.stats && this.stats.updateCount('HttpRequests', 1)
      });

    /**
     * Listen to the `upgrade` event and proxy the
     * WebSocket requests as well.
     */

    server.on('upgrade', this.websocketsUpgrade)

    server.on('error', (err) => {

      this.log && this.log.error(err, 'Server Error')

      this.stats && this.stats.updateCount('HttpErrors', 1)
    });

    server.on('clientError', (error, socket) => {

      this.log && this.log.error(error, 'Http Client Error')
      this.stats && this.stats.updateCount('HttpClientErrors', 1)
    })

    server.on('listening', () => {

      this.log && this.log.info(server.address(), `Http server listening`);
    })

    server.listen(options.port, options.host)

    return server
  }

  /**
   * Start the https server
   */

  protected setupHttpsServer = (httpsOptions: HttpsServerOptions): https.Server => {

    /**
     * Set up the SNI callback to handle multiple hostnames 
     * If there are no credentials for a host, pass the default credentials 
     * set at startup in the https options
     */

    const httpsServerOptions: https.ServerOptions = {

      SNICallback: (hostname: string, cb: (error: Error, ctx: SecureContext) => void) => {

        const certificate = this.certificates.getCertificate(hostname)

        if (cb) {

          if (certificate) {

            cb(null, certificate)
          }
          else {

            this.log && this.log.error({ hostname: hostname }, 'Certificate not found')

            cb(new Error(`Certificate not available for ${hostname}`), null)
          }
        }
        else {

          return certificate
        }
      },

      key: this.certificates.getCertificateData(httpsOptions.keyFilename, false),
      cert: this.certificates.getCertificateData(httpsOptions.certificateFilename, false),
      ca: this.certificates.getCertificateData(httpsOptions.caFilename, true),
    }

    /**
     * Merge the httpServerOptions into the startup options
     */

    if (httpsOptions.httpsServerOptions) {

      Object.assign(httpsServerOptions, httpsOptions.httpsServerOptions)
    }

    /**
     * start the server
     */

    const httpsServer: https.Server = https.createServer(httpsServerOptions)

    httpsServer.on('request',

      (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

        /**
         * Get the host name from the request and use it to find the proper router
         */

        const hostName = this.getInboundHostname(req);
        const router = this.routers[hostName]

        /**
         * Pass off the heavy lifting to the router
         */

        if (router) {

          router.routeHttps(req, res)
        }
        else {

          /**
           * Gracefully decline unknown routes
           */

          respondNotFound(req, res)

          this.stats && this.stats.updateCount('HttpsMissingRoutes', 1)
        }

        this.stats && this.stats.updateCount('HttpsRequests', 1)
      });

      /**
      * Listen to the `upgrade` event and proxy the
      * WebSocket requests as well.
      */

    httpsServer.on('upgrade', this.websocketsUpgrade)

    httpsServer.on('error', (err: Error) => {

      this.log && this.log.error(err, 'Https Server Error')

      this.stats && this.stats.updateCount('HttpsErrors', 1)
    })

    httpsServer.on('clientError', (error, socket) => {

      this.log && this.log.error(error, 'Https Client Error')
      this.stats && this.stats.updateCount('HttpsClientErrors', 1)
    })

    httpsServer.on('listening', () => {

      this.log && this.log.info(httpsServer.address(), `Https server listening`)
    })

    httpsServer.listen(httpsOptions.port, httpsOptions.host);

    return httpsServer;
  }

  /**
   * If you are behind another proxy you might want to use the forwarded host name
   */

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

  /**
   * Handle the request ot upgrade to websockets.
   * Most of the work is handled by http-proxy
   */

  protected websocketsUpgrade = (req: ExtendedIncomingMessage, socket: net.Socket, head: Buffer | null) => {

    socket.on('error', (err) => {

      this.log && this.log.error(err, 'WebSockets error')

      this.stats && this.stats.updateCount('WebsocketErrors', 1)
    })

    const hostname = this.getInboundHostname(req);
    const router = this.routers[hostname]

    /**
     * We do a little more of the work here rather than in the router
     */

    if (router) {

      /**
       * Get the target from the router
       */

      const target = router.getTarget(req)
      this.log && this.log.info({ from: hostname, target: target.host }, 'upgrade to websockets')

      if (target) {
        try {

          /**
           * Get the http-proxy to handle the actual upgrade
           */

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

  /**
   * Close down the system gracefully
   * 
   * We do not have a handle to the Statistics server here.
   * 
   * If you are using a statistics server you must close that in your main code
   */

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

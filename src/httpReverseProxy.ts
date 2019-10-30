import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import net from 'net'
import { SecureContext } from 'tls'
import Certificates from './certificates'
import BaseLetsEncryptClient, { BaseLetsEncryptOptions } from './letsEncrypt'
import LetsEncryptUsingAcmeClient, { LetsEncryptClientOptions } from './letsEncryptUsingAcmeClient'
import HTTPRouter, { ExtendedIncomingMessage, RouteRegistrationOptions, HTTPRouterOptions } from './httpRouter'
import { LoggerInterface } from './simpleLogger'
import { ProxyUrl, makeUrl, respondNotFound } from './util'

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm?: boolean
}

export interface HTTPReverseProxyOptions {
  port?: number
  interface?: string  // TO DO make this an array of strings or interface options
  proxy?: ExtendedProxyOptions
  https?: HttpsServerOptions
  letsEncrypt?: BaseLetsEncryptOptions
  preferForwardedHost?: boolean,
  log?: LoggerInterface
}

export interface HttpsServerOptions {
  port: number
  certificates: Certificates | string
  interface?: string  // TO DO make this an array of strings or interface options
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
  proxy: defaultProxyOptions,
  https: null,
  preferForwardedHost: false,
}

const defaultHttpsOptions: HttpsServerOptions = {
  port: 443,
  certificates: '../certificates'
}

export default class HTTPReverseProxy {

  protected options: HTTPReverseProxyOptions;
  protected proxy: httpProxy
  protected server: http.Server // TO DO make this an array
  protected httpsOptions: HttpsServerOptions
  protected httpsServer: https.Server // TO DO make this an array
  protected certificates: Certificates
  protected letsEncrypt: BaseLetsEncryptClient
  protected routers: HTTPRouters
  protected log: LoggerInterface

  constructor(options?: HTTPReverseProxyOptions,
    letsEncrypt: typeof BaseLetsEncryptClient = LetsEncryptUsingAcmeClient) {

    this.options = options = { ...defaultHttpOptions, ...options }

    // if ('undefined' !== typeof options.log)
    this.log = options.log

    // if ('undefined' === typeof options.proxy)
    //   options.proxy = defaultProxyOptions

    this.routers = {}
    this.proxy = this.createProxyServer({ ...defaultProxyOptions, ...options.proxy })
    this.server = this.setupHttpServer(options)

    if (options.https) {

      this.httpsOptions = { ...defaultHttpsOptions, ...options.https }

      this.certificates =
        'string' === typeof this.httpsOptions.certificates
          ? new Certificates(this.httpsOptions.certificates)
          : this.httpsOptions.certificates

      this.httpsOptions.interface = this.httpsOptions.interface || options.interface
      this.httpsServer = this.setupHttpsServer(this.httpsOptions)

      if (options.letsEncrypt) {

        const letsEncryptOptions: LetsEncryptClientOptions = {
          // dnsChallenge: configOptions.dnsUpdate,
          certificates: this.certificates,
          log: this.log,
          ...options.letsEncrypt
        }

        this.letsEncrypt = new letsEncrypt(letsEncryptOptions)
      }
    }
  }

  public addRoute = (from: string | Partial<URL>, to: string | ProxyUrl | (string | ProxyUrl)[],
    registrationOptions?: RouteRegistrationOptions) => {

    if (!from || !to || (Array.isArray(to) && to.length === 0)) {
      throw Error('Cannot add a new route with unspecified "from" or "to"')
    }

    from = makeUrl(from)

    let router = this.routers[from.hostname]

    if (!router) {

      const options: HTTPRouterOptions = {
        proxy: this.proxy,
        log: this.log
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
    }

    router.addRoute(from, to, registrationOptions)

    if (router.noRoutes()) {

      delete this.routers[from.hostname]
      throw Error('Cannot add a new route with unspecified "from" or "to"')
    }
  }

  public removeRoute = (from: string | Partial<URL>, to?: string | ProxyUrl) => {

    from = makeUrl(from)

    const router = this.routers[from.hostname]

    if (router) {

      router.removeRoute(from, makeUrl(to))

      if (router.noRoutes()) {

        delete this.routers[from.hostname]
        this.certificates && this.certificates.removeCertificate(from.hostname);
      }
    }
  }

  protected createProxyServer(proxyOptions: ExtendedProxyOptions): httpProxy {
    const proxy = httpProxy.createProxyServer(proxyOptions)

    proxy.on('proxyReq', (clientRequest: http.ClientRequest, req: http.IncomingMessage) => {
      if (req.headers.host !== null) {
        clientRequest.setHeader('host', req.headers.host)
      }
    })

    if (proxyOptions.ntlm) {
      proxy.on('proxyReq', (request: http.ClientRequest) => {
        const key = 'www-authenticate'
        request.setHeader(key, request.getHeader(key) && (request.getHeader(key) as string).split(','))
      })
    }

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
        }
      });

    //
    // Listen to the `upgrade` event and proxy the
    // WebSocket requests as well.
    //
    server.on('upgrade', this.websocketsUpgrade)

    server.on('error', function (err) {
      this.log && this.log.error(err, 'Server Error')
    });

    server.on('listening', () => {
      const serverAddress = server.address()
      this.log && this.log.info(serverAddress,
        `HTTP server listening`);
    })

    server.listen(options.port, options.interface)

    return server
  }


  // protected setupHttpsServers = (options: SSLOptions | SSLOptions[]) => {
  //   if (!!options) {
  //     if (Array.isArray(options)) {
  //       options.forEach((ssl) => {
  //         this.setupHttpsServer(this.proxy, ssl)
  //       })
  //     }
  //     else {
  //       this.setupHttpsServer(this.proxy, options)
  //     }
  //   }
  // }

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
        }
      });


    //   //
    //   // Listen to the `upgrade` event and proxy the
    //   // WebSocket requests as well.
    //   //
    httpsServer.on('upgrade', this.websocketsUpgrade);

    httpsServer.on('error', function (err: Error) {

      this.log && this.log.error(err, 'HTTPS Server Error');
    });

    httpsServer.on('clientError', function (error, socket) {

      this.log && this.log.error(error, 'HTTPS Client Error')
      socket.end('HTTP/1.1 400 Bad Request')
    });

    httpsServer.on('listening', () => {

      const serverAddress = httpsServer.address()

      this.log && this.log.info(serverAddress,
        `HTTPS server listening`);
    })

    httpsServer.listen(httpsOptions.port, httpsOptions.interface);

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
      socket.end('HTTP/1.1 400 Bad Request')
    });

    const hostName = this.getInboundHostname(req);
    const router = this.routers[hostName]

    if (router) {

      const target = router.getTarget(req)
      this.log && this.log.info({ headers: req.headers, target: target }, 'upgrade to websockets');

      if (target) {
        this.proxy.ws(req, socket, head, { target: target, secure: target.secure });
      }
      else {
        socket.end('HTTP/1.1 400 Bad Request')
      }
    }
    else {
      socket.end('HTTP/1.1 400 Bad Request')
    }
  }

  public close = () => {
    try {
      this.server.close();
      this.httpsServer && this.httpsServer.close();
      this.letsEncrypt && this.letsEncrypt.close();
    } catch (err) {
      // Ignore for now...
    }
  }
}

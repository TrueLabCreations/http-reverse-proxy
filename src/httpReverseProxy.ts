import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import net from 'net'
import { SecureContext } from 'tls'
import path from 'path'
import fs from 'fs'
import acmeClient from 'acme-client'
import { CsrOptions } from 'acme-client/crypto/forge';
import { AddressInfo } from 'net'
import Certificates from './certificates'
import LetsEncryptUsingAcmeClient from './letsEnryptUsingAcmeClient'
import HTTPRouter, { ExtendedIncomingMessage, ProxyTargetUrl } from './httpRouter'
import { LoggerInterface } from './simpleLogger'
import AbstractLetsEncryptClient from './letsEncrypt'

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm?: boolean
}

interface HttpsServerOptions {
  // secure: boolean;
  port: number
  // certificateStoreRoot: string
  certificates: Certificates | string
  interface?: string
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  redirectPort?: number
  // http2?: boolean
  // serverModule?: typeof https
  // useTargetHostHeader?: boolean
  tlsSecureOptions?: number
  httpsServerOptions?: https.ServerOptions
}

interface LetsEncryptOptions {
  port?: number
  renewWithin?: number
  // challengePath: string
  // maintainCertificates: boolean
}

export interface HTTPReverseProxyOptions {
  port?: number
  interface?: string
  proxy?: ExtendedProxyOptions
  https?: HttpsServerOptions
  letsEncrypt?: LetsEncryptOptions
  preferForwardedHost?: boolean,
  log?: LoggerInterface
  // serverModule: typeof http | typeof https
}

// const defaultRegistrationOptions: RegistrationOptions = {
//   https: null,
//   useTargetHostHeader: false
// }

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

// const ONE_DAY = 60 * 60 * 24 * 1000;
// const ONE_MONTH = ONE_DAY * 30;

export default class HTTPReverseProxy {

  protected options: HTTPReverseProxyOptions;
  protected proxy: httpProxy;
  protected server: http.Server
  protected httpsOptions: HttpsServerOptions
  protected httpsServer: https.Server
  // protected routing: Routes = {};
  protected certificates: Certificates
  protected letsEncrypt: AbstractLetsEncryptClient
  protected letsEncryptHost: string
  protected httpRouter: HTTPRouter
  protected log: LoggerInterface

  constructor(options?: HTTPReverseProxyOptions) {
    this.options = options = { ...defaultHttpOptions, ...options }
    if ('undefined' !== typeof options.log)
      this.log = options.log
    if ('undefined' === typeof options.proxy)
      options.proxy = defaultProxyOptions
    this.proxy = this.createProxyServer(options.proxy || defaultProxyOptions)
    this.server = this.setupHttpServer(this.proxy, options)

    if (options.https) {
      this.httpsOptions = { ...defaultHttpsOptions, ...options.https }
      this.certificates =
        'string' === typeof this.httpsOptions.certificates
          ? new Certificates(this.httpsOptions.certificates)
          : this.httpsOptions.certificates

      this.httpsOptions.interface = this.httpsOptions.interface || options.interface
      this.httpsServer = this.setupHttpsServer(this.proxy, this.httpsOptions)
    }

    if (options.letsEncrypt) {
      this.letsEncrypt = new LetsEncryptUsingAcmeClient(
        {
          certificates: this.certificates,
          log: this.log,
          ...options.letsEncrypt
        })
      this.letsEncryptHost = this.letsEncrypt.href
    }

    this.httpRouter = new HTTPRouter(
      {
        certificates: this.certificates,
        preferForwardedHost: options.preferForwardedHost,
        routingHttps: !!this.httpsOptions,
        letsEncrypt: this.letsEncrypt,
        log: this.log
      }
    )
  }

  public get router() {
    return this.httpRouter
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

  protected setupHttpServer = (proxy: httpProxy, options: HTTPReverseProxyOptions): http.Server => {
    // const httpServerModule = options.serverModule || http;
    const server = http.createServer((req: ExtendedIncomingMessage, res: http.ServerResponse) => {
      const source = this.httpRouter.getSource(req);
      const target = this.httpRouter.getTarget(source, req)
      if (target) {
        if (this.shouldRedirectToHttps(source, target)) {
          this.redirectToHttps(req, res, this.httpsOptions);
        } else {
          //TO DO handle errors
          proxy.web(req, res, { target: target, secure: options.proxy.secure !== false }, (error, req, res) => {
            this.respondNotFound(req, res)
          });
        }
      } else {
        this.respondNotFound(req, res);
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

  private shouldRedirectToHttps = (src: string, target: ProxyTargetUrl) => {
    return this.certificates
      && this.certificates.getCertificate(src)
      && target.sslRedirect
      && target.host != this.letsEncryptHost; //TO DO - I think this is WRONG
  }
  
  private redirectToHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse, httpsOptions: HttpsServerOptions) => {
    req.url = req.originalUrl || req.url; // Get the original url since we are going to redirect.

    const targetPort = httpsOptions.redirectPort || httpsOptions.port;
    const hostname = req.headers.host.split(':')[0] + (targetPort ? ':' + targetPort : '');
    const url = 'https://' + path.join(hostname, req.url);
    this.log && this.log.info(null, `Redirecting ${path.join(req.headers.host, req.url)} to ${url}`);
    //
    // We can use 301 for permanent redirect, but its bad for debugging, we may have it as
    // a configurable option.
    //
    res.writeHead(302, { Location: url });
    res.end();
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

  protected setupHttpsServer = (proxy: httpProxy, httpsOptions: HttpsServerOptions): https.Server => {

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
      // ca: this.certificates.getCertificateData(httpsOptions.caFilename, true),
      // secureOptions: httpsOptions.tlsSecureOptions// || SSL_OP_NO_SSLv3
    }

    if (httpsOptions.httpsServerOptions)
      Object.assign(httpsServerOptions, httpsOptions.httpsServerOptions)

    // const httpServerModule: typeof https = options.serverModule || https;
    const httpsServer: https.Server = https.createServer(httpsServerOptions,
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        const source = this.httpRouter.getSource(req);
        const httpProxyOptions = Object.assign({}, this.options.proxy)
        const target = this.httpRouter.getTarget(source, req as ExtendedIncomingMessage)
        if (target) {
          httpProxyOptions.target = target
          //TO DO handle errors
          proxy.web(req, res, httpProxyOptions, (error, req, res) => {
            this.respondNotFound(req, res)
          })
        }
        else {
          this.respondNotFound(req, res)
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

    httpsServer.on('clientError', function (err) {
      this.log && this.log.error(err, 'HTTPS Client Error');
    });

    httpsServer.on('listening', () => {
      const serverAddress = httpsServer.address()
      this.log && this.log.info(serverAddress,
        `HTTPS server listening`);
    })

    httpsServer.listen(httpsOptions.port, httpsOptions.interface);

    return httpsServer;
  }

  protected websocketsUpgrade = (req: ExtendedIncomingMessage, socket: net.Socket, head: Buffer | null) => {
    socket.on('error', function (err) {
      this.log && this.log.error(err, 'WebSockets error');
    });
    const src = this.router.getSource(req);
    const target = this.router.getTarget(src, req)
    this.log && this.log.info({ headers: req.headers, target: target }, 'upgrade to websockets');
    if (target) {
      this.proxy.ws(req, socket, head, { target: target });
    } else {
      socket.end("Not Found")
    }
  }

  protected respondNotFound = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.statusCode = 404;
    res.write('Not Found');
    res.end();
  };

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

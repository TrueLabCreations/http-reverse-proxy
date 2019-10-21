import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import tls, { SecureContext } from 'tls'
import url, { parse as urlParse } from 'url'
import path from 'path'
import fs from 'fs'
import acmeClient from 'acme-client'
import { CsrOptions } from 'acme-client/crypto/forge';
import { AddressInfo } from 'net'
import Certificates from './certificates'
import LetsEncrypt from './letsEnryptUsingAcmeClient'
import HTTPRouter, { ExtendedIncomingMessage, ProxyTargetUrl } from './httpRouter'
import SimpleLogger, { LoggerInterface } from './simpleLogger'

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm?: boolean
}

interface HttpsServerOptions {
  // secure: boolean;
  port: number
  certificateStoreRoot: string
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

// interface ProxyTargetUrl extends url.Url {
//   useTargetHostHeader?: boolean
//   sslRedirect?: boolean
// }

// interface Route {
//   path: string
//   roundRobin: number
//   targets: ProxyTargetUrl[]
// }

// interface Routes {
//   [host: string]: Route[]
// }

// // interface Certificates {
// //   [host: string]: SecureContext
// // }

// interface RegistrationLetsEncryptOptions {
//   email: string
//   production: boolean
// }

// interface RegistrationHttpsOptions {
//   redirect: boolean
//   keyPath?: string
//   certificatePath?: string
//   caPath?: string
//   secureOptions?: number
//   letsEncrypt?: RegistrationLetsEncryptOptions
// }

// interface RegistrationOptions {
//   https?: RegistrationHttpsOptions | boolean,
//   useTargetHostHeader?: boolean
// }

// interface ExtendedIncomingMessage extends http.IncomingMessage {
//   host: string;
//   originalUrl: string
// }

interface LetsEncryptOptions {
  port?: number
  renewWithin?: number
  challengePath: string
  // maintainCertificates: boolean
}

export interface HTTPReverseProxyOptions {
  port: number
  interface?: string
  proxy?: ExtendedProxyOptions
  https?: HttpsServerOptions
  letsEncrypt?: LetsEncryptOptions
  preferForwardedHost: boolean,
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

const defaultOptions: HTTPReverseProxyOptions = {
  port: 8080,
  // maintainCertificates: false,
  proxy: defaultProxyOptions,
  https: null,
  preferForwardedHost: false,
  // serverModule: null
}

// const ONE_DAY = 60 * 60 * 24 * 1000;
// const ONE_MONTH = ONE_DAY * 30;

export default class HTTPReverseProxy {

  protected options: HTTPReverseProxyOptions;
  protected proxy: httpProxy;
  protected server: http.Server
  protected httpsServer: https.Server
  // protected routing: Routes = {};
  protected certificates: Certificates
  protected letsEncrypt: LetsEncrypt
  protected letsEncryptHost: string
  protected httpRouter: HTTPRouter
  protected log: LoggerInterface

  constructor(options?: HTTPReverseProxyOptions) {
    this.options = options = Object.assign({}, options || defaultOptions)
    if ('undefined' !== typeof options.log)
      this.log = options.log
    if ('undefined' === typeof options.proxy)
      options.proxy = defaultProxyOptions
    this.proxy = this.createProxyServer(options.proxy || defaultProxyOptions)
    this.server = this.setupHttpServer(this.proxy, options)
    if (options.https) {
      this.certificates = new Certificates(options.https.certificateStoreRoot)
      options.https.interface = options.https.interface || options.interface
      this.httpsServer = this.setupHttpsServer(this.proxy, options.https)
    }
    if (options.letsEncrypt) {
      this.letsEncrypt = new LetsEncrypt({ ...options.letsEncrypt, certificates: this.certificates, log: this.log })
      this.letsEncryptHost = this.letsEncrypt.href
    }
    this.httpRouter = new HTTPRouter(
      this.certificates,
      {
        preferForwardedHost: options.preferForwardedHost,
        routingHttps: !!options.https
      },
      this.letsEncrypt,
      this.log)
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
          this.redirectToHttps(req, res, options.https);
        } else {
          proxy.web(req, res, { target: target, secure: options.proxy.secure !== false });
        }
      } else {
        this.respondNotFound(req, res);
      }
    });

    //
    // Listen to the `upgrade` event and proxy the
    // WebSocket requests as well.
    //
    // server.on('upgrade', websocketsUpgrade);

    server.on('error', function (err) {
      this.log.error(err, 'Server Error');
    });

    server.listen(options.port, options.interface)
    this.log && this.log.info(null, `Listening to HTTP requests on port ${options.port}`);

    return server;
  }

  shouldRedirectToHttps = (src: string, target: ProxyTargetUrl) => {
    return this.certificates && src in this.certificates && target.sslRedirect && target.host != this.letsEncryptHost;
  }

  redirectToHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse, httpsOptions: HttpsServerOptions) => {
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
          cb(null, this.certificates[hostname])
        }
        else {
          return this.certificates[hostname]
        }
      },
      key: this.certificates.getCertificateData(httpsOptions.keyFilename, false),
      cert: this.certificates.getCertificateData(httpsOptions.certificateFilename, false),
      ca: this.certificates.getCertificateData(httpsOptions.caFilename, true),
      secureOptions: httpsOptions.tlsSecureOptions
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
          proxy.web(req, res, httpProxyOptions)
        }
        else {
          this.respondNotFound(req, res)
        }
      });


    //   //
    //   // Listen to the `upgrade` event and proxy the
    //   // WebSocket requests as well.
    //   //
    //   // server.on('upgrade', websocketsUpgrade);

    httpsServer.on('error', function (err: Error) {
      this.log && this.log.error(err, 'HTTPS Server Error');
    });

    httpsServer.on('clientError', function (err) {
      this.log && this.log.error(err, 'HTTPS Client Error');
    });

    this.log && this.log.info(null, `Listening to HTTPS requests on port ${httpsOptions.port}`);
    httpsServer.listen(httpsOptions.port, httpsOptions.interface);

    return httpsServer;
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

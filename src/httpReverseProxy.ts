import httpProxy from 'http-proxy'
import http from 'http'
import https from 'https'
import tls, { SecureContext } from 'tls'
import url, { parse as urlParse } from 'url'
import path from 'path'
import fs from 'fs'
import acmeClient from 'acme-client'
import { CsrOptions } from 'acme-client/crypto/forge';

interface ExtendedProxyOptions extends httpProxy.ServerOptions {
  ntlm: boolean
}

interface HttpsOptions {
  // secure: boolean;
  port: number
  certificatePath: string
  networkInterface?: string
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  redirectPort?: number
  // http2?: boolean
  // serverModule?: typeof https
  // useTargetHostHeader?: boolean
  secureOptions?: number
  httpServerOptions?: https.ServerOptions
}

interface ProxyTargetUrl extends url.Url {
  useTargetHostHeader?: boolean
  sslRedirect?: boolean
}

interface Route {
  path: string
  roundRobin: number
  targets: ProxyTargetUrl[]
}

interface Routes {
  [host: string]: Route[]
}

interface Certificates {
  [host: string]: SecureContext
}

interface RegistrationLetsEncryptOptions {
  email: string
  production: boolean
  challengePath: string
}

interface RegistrationHttpsOptions {
  redirect: boolean
  keyPath?: string
  certificatePath?: string
  caPath?: string
  secureOptions?: number
  letsencrypt?: RegistrationLetsEncryptOptions
}

interface RegistrationOptions {
  httpsOptions?: RegistrationHttpsOptions | boolean,
  useTargetHostHeader?: boolean
}

interface ExtendedIncomingMessage extends http.IncomingMessage {
  host: string;
  originalUrl: string
}

type LoggerInterface = (data: Object, message: string) => void;

interface Logger {
  debug: LoggerInterface
  trace: LoggerInterface
  info: LoggerInterface
  warn: LoggerInterface
  error: LoggerInterface
  fatal: LoggerInterface
  [property: string]: any
}

export interface HTTPReverseProxyOptions {
  port: number
  interface?: string
  maintainCertificates: boolean
  proxyOptions: ExtendedProxyOptions
  httpsOptions?: HttpsOptions
  letsencrypt?: {
    // certificateStoreRoot: string
    port?: number
    renewWithin?: number
  }
  preferForwardedHost: boolean,
  log?: Logger
  // serverModule: typeof http | typeof https
}

const defaultOptions: HTTPReverseProxyOptions = {
  port: 8080,
  maintainCertificates: false,
  proxyOptions: {
    xfwd: false,
    secure: true,
    ntlm: false,
    // target: null,
  },
  httpsOptions: null,
  preferForwardedHost: false,
  // serverModule: null
}

const defaultRegistrationOptions: RegistrationOptions = {
  httpsOptions: null,
  useTargetHostHeader: false
}

const ONE_DAY = 60 * 60 * 24 * 1000;
const ONE_MONTH = ONE_DAY * 30;

export default class HTTPReverseProxy {

  protected options: HTTPReverseProxyOptions;
  protected proxy: httpProxy;
  protected server: http.Server
  protected httpsServer: https.Server
  protected routing: Routes = {};
  protected certificates: Certificates = {}

  constructor(options?: HTTPReverseProxyOptions) {
    this.options = options = options || defaultOptions
    if ('undefined' !== typeof options.log)
      this.log = options.log
    this.proxy = this.createProxyServer(options.proxyOptions)
    this.server = this.setupHttpServer(this.proxy, options)
    if (options.httpsOptions) {
      this.httpsServer = this.setupHttpsServer(this.proxy, options.httpsOptions)
    }
  }

  private logStringify = (data: {} | null, message: string): string => {
    if (data) {
      return `${JSON.stringify(data)}: ${message}`
    }
    return message
  }

  protected log: Logger = {
    debug: (data: {} | null, message: string) => {
      console.log(this.logStringify(data, message))
    },
    trace: (data: {} | null, message: string) => {
      console.log(this.logStringify(data, message))
    },
    info: (data: {} | null, message: string) => {
      console.log(this.logStringify(data, message))
    },
    warn: (data: {} | null, message: string) => {
      console.warn(this.logStringify(data, message))
    },
    error: (data: {} | null, message: string) => {
      console.error(this.logStringify(data, message))
    },
    fatal: (data: {} | null, message: string) => {
      console.error(this.logStringify(data, message))
    }
  }

  protected createProxyServer(options: ExtendedProxyOptions): httpProxy {
    const proxy = httpProxy.createProxyServer(options)
    // {
    //   xfwd: (options.xfwd !== false),
    //   prependPath: false,
    //   secure: (options.secure !== false)
    // })

    proxy.on('proxyReq', (clientRequest: http.ClientRequest, req: ExtendedIncomingMessage) => {
      if (req.headers.host !== null) {
        clientRequest.setHeader('host', req.headers.host)
      }
    })

    if (options.ntlm) {
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
      const source = this.getSource(req);
      const target = this.getTarget(source, req)
      if (target) {
        if (this.shouldRedirectToHttps(source, target)) {
          this.redirectToHttps(req, res, options.httpsOptions);
        } else {
          proxy.web(req, res, { target: target, secure: options.proxyOptions.secure !== false });
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
    return this.certificates && src in this.certificates && target.sslRedirect //&& target.host != this.proxy.letsencryptHost;
  }

  redirectToHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse, httpsOptions: HttpsOptions) => {
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

  protected setupHttpsServer = (proxy: httpProxy, httpsOptions: HttpsOptions): https.Server => {

    const httpsServerOptions: https.ServerOptions = {
      SNICallback: (hostname: string, cb: (error: Error, ctx: SecureContext) => void) => {
        if (cb) {
          cb(null, this.certificates[hostname])
        }
        else {
          return this.certificates[hostname]
        }
      },
      key: this.getCertificateData(httpsOptions.keyFilename),
      cert: this.getCertificateData(httpsOptions.certificateFilename),
      ca: null,
      secureOptions: null
    }

    if (httpsOptions.secureOptions) {
      httpsServerOptions.secureOptions = httpsOptions.secureOptions
    }

    if (httpsOptions.caFilename) {
      httpsServerOptions.ca = this.getCertificateData(httpsOptions.caFilename, true)
    }

    if (httpsOptions.httpServerOptions)
      Object.assign(httpsServerOptions, httpsOptions.httpServerOptions)

    // const httpServerModule: typeof https = options.serverModule || https;
    const httpsServer: https.Server = https.createServer(httpsServerOptions,
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        const source = this.getSource(req);
        const httpProxyOptions = Object.assign({}, this.options.proxyOptions)
        const target = this.getTarget(source, req as ExtendedIncomingMessage)
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
    httpsServer.listen(httpsOptions.port, httpsOptions.networkInterface);

    return httpsServer;
  }

  public forward = (from: string | Partial<URL>, to: string | ProxyTargetUrl,
    registrationOptions: RegistrationOptions = defaultRegistrationOptions) => {
    // if (this.options.cluster && cluster.isMaster) return this;

    if (!from || !to) {
      throw Error('Cannot register a new route with unspecified "from" or "to"');
    }

    var routing = this.routing;

    from = this.prepareUrl(from);

    if (registrationOptions) {
      const ssl: RegistrationHttpsOptions = registrationOptions.httpsOptions as RegistrationHttpsOptions;
      if (ssl) {
        if (!this.httpsServer) {
          throw Error('Cannot register https routes without defining a ssl port');
        }

        if (!this.certificates[from.hostname]) {
          if ('object' === typeof ssl) {
            if (ssl.keyPath || ssl.certificatePath || ssl.caPath) {
              this.certificates[from.hostname] = this.createCredentialContext(ssl.keyPath, ssl.certificatePath, ssl.caPath);
            }
            else if (ssl.letsencrypt) {
              if (!this.options.letsencrypt || !this.options.httpsOptions.certificatePath) {
                console.error('Missing certificate path for Lets Encrypt');
                return;
              }
              this.log && this.log.info(null, `Getting Let's Encrypt certificates for ${from.hostname}`);
              this.getLetsEncryptCertificate(
                from.hostname,
                ssl.letsencrypt,
                this.options.letsencrypt.renewWithin || ONE_MONTH);
            }
          }
          else {
            // Trigger the use of the default certificates.
            this.certificates[from.hostname] = void 0;
          }
        }
      }
    }
    to = this.buildTarget(to, registrationOptions);

    const hosts = routing[from.hostname] = routing[from.hostname] || [];
    const pathname = from.pathname || '/';
    let route = hosts.find((host) => host.path === pathname);

    if (!route) {
      route = { path: pathname, roundRobin: 0, targets: [] };
      hosts.push(route);

      //
      // Sort routes -- longer routes first
      //
      routing[from.hostname] = hosts.sort((routeA, routeB) => routeB.path.length - routeA.path.length);
    }

    route.targets.push(to);

    this.log && this.log.info({ from: from, to: to }, 'Registered a new route');
    return this;
  };

  public unforward = (from: string | Partial<URL>, to?: string | ProxyTargetUrl) => {
    // if (this.opts.cluster && cluster.isMaster) return this;

    if (!from) {
      return this;
    }

    from = this.prepareUrl(from);
    const routes = this.routing[from.hostname] || [];
    const pathname = from.pathname || '/';

    const routeIndex = routes.findIndex((route) => route.path === pathname)

    if (routeIndex >= 0) {
      const route = routes[routeIndex]
      if (to) {
        to = this.prepareUrl(to);
        const targetIndex = route.targets.findIndex((searchTarget) => searchTarget.href === (to as ProxyTargetUrl).href)
        if (targetIndex >= 0) {
          route.targets.splice(targetIndex, 1)
        }
      } else {
        route.targets = [];
      }

      if (route.targets.length === 0) {
        routes.splice(routeIndex, 1);
        if (routes.length === 0)
          delete this.routing[from.hostname]
        const certs = this.certificates;
        if (certs) {
          // if (certs[src.hostname] && certs[src.hostname].renewalTimeout) {
          //   safe.clearTimeout(certs[src.hostname].renewalTimeout);
          // }
          delete certs[from.hostname];
        }
      }

      this.log && this.log.info({ from: from, to: to }, 'Unregistered a route');
    }
    return this;
  }

  private exists = async (path: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      fs.exists(path, (exists: boolean) => {
        resolve(!exists)
      })
    })

  }
  private writeFile = async (path: string, data: any, opts = 'utf8'): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      fs.writeFile(path, data, opts, (err) => {
        resolve(!err)
      })
    })
  }

  private mkDir = async (path: string, opts = { recursive: true }) => {
    return new Promise((resolve, reject) => {
      fs.mkdir(path, opts, (err) => {
        resolve(!err)
      })
    })
  }

  private unlink = async (path: string) => {
    return new Promise((resolve, reject) => {
      fs.unlink(path, (err) => {
        resolve(!err)
      })
    })
  }

  protected getLetsEncryptCertificate = async (domain: string, options: RegistrationLetsEncryptOptions,
    renewWithin: number, forceRenew?: boolean): Promise<tls.SecureContext> => {
    const rootPath = this.options.httpsOptions.certificatePath + '/' + domain + '/'
    const keyPath = rootPath + 'server-key.pem'
    const certificatePath = rootPath + 'server-crt.pem'

    if (!forceRenew && await this.exists(keyPath) &&
      await this.exists(certificatePath)) {

      //TO DO need to check for expiring certificate
      return this.createCredentialContext(keyPath, certificatePath)
    }

    this.forward(`${domain}/.well-known/acme-challenge`, `http://localhost:${this.options.letsencrypt.port || 3000}`)

    if (await this.getNewCertificate(domain, options)) {
      this.unforward(`${domain}/.well-known/acme-challenge`, `http://localhost:${this.options.letsencrypt.port || 3000}`)
      return this.getLetsEncryptCertificate(domain, options, 0, false)
    }
    this.unforward(`${domain}/.well-known/acme-challenge`, `http://localhost:${this.options.letsencrypt.port || 3000}`)

    return null
  };

  protected getNewCertificate = async (domain: string, options: RegistrationLetsEncryptOptions): Promise<boolean> => {
    const clientOptions: acmeClient.Options = {
      directoryUrl: options.production ? acmeClient.directory.letsencrypt.production : acmeClient.directory.letsencrypt.staging,
      accountKey: await acmeClient.forge.createPrivateKey()
    }

    const orderRequest: acmeClient.CreateOrderRequest = {
      identifiers: [{ type: 'dns', value: domain }]
    }

    const client: acmeClient.Client = new acmeClient.Client(clientOptions)

    const account: acmeClient.Account = await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:' + options.email]
    })

    const order: acmeClient.Order = await client.createOrder(orderRequest)

    const authorization: acmeClient.Authorization = await client.getAuthorizations(order)[0]

    const { challenges } = authorization

    let challenge = challenges.find((challenge) => challenge.type === 'http-01')

    if (!challenge)
      return false

    const challengeFilename = `${options.challengePath}/${(challenge as acmeClient.Http01Challenge).token}`

    try {
      const keyAuthorization: string = await client.getChallengeKeyAuthorization(challenge)

      if (! await this.writeFile(challengeFilename, keyAuthorization))
        return false

      await client.verifyChallenge(authorization, challenge)

      await client.completeChallenge(challenge)

      await client.waitForValidStatus(challenge)
    }
    catch (e) {
      return false
    }
    finally {
      try {
        await this.unlink(challengeFilename);
      }
      catch (e) {
      }
    }

    const csrOptions: CsrOptions = {
      commonName: domain
    }

    const [key, csr] = await acmeClient.forge.createCsr(csrOptions)
    await client.finalizeOrder(order, csr);
    const certificate: string = await client.getCertificate(order);

    const certificateStoreRoot = `${this.options.httpsOptions.certificatePath}/${domain.replace('.', '_')}`

    this.log && this.log.info(null, `Saving key and certificate at path: ${certificateStoreRoot}`);

    return await this.mkDir(certificateStoreRoot, { recursive: true }) &&
      await this.writeFile(`${certificateStoreRoot}/server-key.pem`, key) &&
      await this.writeFile(`${certificateStoreRoot}/server-crt.pem`, certificate);
  }


  protected getSource = (req: http.IncomingMessage) => {
    const forwardedHost = req.headers['x-forwarded-host']

    if (this.options.preferForwardedHost === true && forwardedHost) {
      if (Array.isArray(forwardedHost)) {
        return forwardedHost[0].split(':')[0]
      }
      return forwardedHost.split(':')[0];
    }
    if (req.headers.host) {
      return req.headers.host.split(':')[0];
    }
  }

  protected getTarget = (source: string, req: ExtendedIncomingMessage): ProxyTargetUrl => {
    const url = req.url;

    const route: Route = this.resolve(source, url)
    if (!route) {
      this.log && this.log.warn({ src: source, url: url }, 'no valid route found for given source');
      return null;
    }

    const pathname: string = route.path;
    if (pathname.length > 1) {
      //
      // remove prefix from src
      //
      req.originalUrl = url; // save original url
      req.url = url.substr(pathname.length) || '/';
    }

    //
    // Perform Round-Robin on the available targets
    // TODO: if target errors with EHOSTUNREACH we should skip this
    // target and try with another.
    //
    const targets = route.targets;
    const j = route.roundRobin;
    route.roundRobin = (j + 1) % targets.length; // get and update Round-robin index.
    const target = route.targets[j];

    //
    // Fix request url if targetname specified.
    //
    if (target.pathname) {
      req.url = path.join(target.pathname, req.url);
    }

    //
    // Host headers are passed through from the source by default
    // Often we want to use the host header of the target instead
    //
    if (target.useTargetHostHeader === true) {
      req.host = target.host;
    }

    this.log && this.log.info(null, `Proxying ${source + url} to ${path.join(target.host, req.url)}`);

    return target;
  }

  protected respondNotFound = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.statusCode = 404;
    res.write('Not Found');
    res.end();
  };


  protected resolve = (host: string, url?: string): Route | null => {
    // Given a url resolve it to a target route if available.
    if (!host) {
      return null;
    }

    url = url || '/';

    const routes = this.routing[host.toLowerCase()];

    if (routes) {
      return routes.find((route) => route.path === '/' || this.startsWith(url, route.path)) || null
    }
    return null
  };

  protected startsWith = (input: string, str: string): boolean => {
    return input.slice(0, str.length) === str &&
      (input.length === str.length || input[str.length] === '/')
  }

  protected prepareUrl = (url: string | ProxyTargetUrl): ProxyTargetUrl => {
    if ("object" === typeof url) {
      return Object.assign({}, url)
    }
    else {
      if ('string' === typeof url) {
        const parsedUrl = urlParse(this.prependHttpIfRequired(url))
        return parsedUrl;
      }
    }
    return null
  }

  protected buildTarget = (target: string | ProxyTargetUrl, options: RegistrationOptions) => {
    target = this.prepareUrl(target);
    target.sslRedirect = options.httpsOptions && 'object' === typeof options.httpsOptions && options.httpsOptions.redirect !== false;
    target.useTargetHostHeader = options.useTargetHostHeader === true;
    return target;
  };

  protected prependHttpIfRequired = (link: string): string => {
    if (link.search(/^http[s]?\:\/\//) === -1) {
      link = 'http://' + link;
    }
    return link;
  }

  protected getCertificateData = (pathname: string | string[], unbundle?: boolean): string | string[] => {

    if (pathname) {
      if (Array.isArray(pathname)) {
        const pathnames: string[] = pathname;
        return pathnames.map((pathname) => {
          return this.getCertificateData(pathname, unbundle)
        }).flat();
      } else if (fs.existsSync(pathname)) {
        if (unbundle) {
          return this.unbundleCertificate(fs.readFileSync(pathname, 'utf8'));
        } else {
          return fs.readFileSync(pathname, 'utf8');
        }
      }
    }
  }

  protected unbundleCertificate = (bundle: string): string[] => {
    const lines: string[] = bundle.trim().split('\n');

    const ca = [];
    let cert = [];

    for (let line of lines) {
      line = line.trim();
      if (!(line.length !== 0)) {
        continue;
      }
      cert.push(line);
      if (line.match(/-END CERTIFICATE-/)) {
        ca.push(cert.join('\n'));
        cert = [];
      }
    }
    return ca;
  }

  protected createCredentialContext = (keyPath: string, certificatePath: string, caPath?: string): SecureContext => {
    const details: tls.SecureContextOptions = {
      key: this.getCertificateData(keyPath),
      cert: this.getCertificateData(certificatePath),
      ca: caPath && this.getCertificateData(caPath, true)
    };

    var credentials = tls.createSecureContext(details);

    return credentials.context;
  }

}

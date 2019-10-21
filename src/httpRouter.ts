import http from 'http'
import url, { parse as urlParse } from 'url'
import path from 'path'
import Certificates from './certificates';
import LetsEncryptUsingAcmeClient from './letsEnryptUsingAcmeClient';
import {LoggerInterface} from './simpleLogger'

export interface ProxyTargetUrl extends url.Url {
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

// interface Certificates {
//   [host: string]: SecureContext
// }

interface RegistrationLetsEncryptOptions {
  email: string
  production: boolean,
  renewWithin?:number
}

interface RegistrationHttpsOptions {
  redirect: boolean
  keyPath?: string
  certificatePath?: string
  caPath?: string
  secureOptions?: number
  letsEncrypt?: RegistrationLetsEncryptOptions
}

interface RegistrationOptions {
  https?: RegistrationHttpsOptions,// | boolean,
  useTargetHostHeader?: boolean
}

export interface ExtendedIncomingMessage extends http.IncomingMessage {
  host: string;
  originalUrl: string
}

export interface HTTPRouterOptions {
  preferForwardedHost: boolean
  routingHttps?:boolean
}

const defaultRegistrationOptions: RegistrationOptions = {
  https: null,
  useTargetHostHeader: false
}

const ONE_DAY = 60 * 60 * 24 * 1000;
const ONE_MONTH = ONE_DAY * 30;

export default class HTTPRouter {
  protected certificates: Certificates
  protected letsEncrypt: LetsEncryptUsingAcmeClient
  protected preferForwardedHost: boolean
  protected log: any
  protected routingHttps: boolean
  protected routing: Routes = {};

  constructor(certificates: Certificates, options: HTTPRouterOptions, letsEncrypt?: LetsEncryptUsingAcmeClient, log?: LoggerInterface) {
    this.certificates = certificates
    this.letsEncrypt = letsEncrypt
    this.preferForwardedHost = this.preferForwardedHost
    this.routingHttps = options.routingHttps
    this.log = log
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
      const ssl: RegistrationHttpsOptions = registrationOptions.https as RegistrationHttpsOptions;
      if (ssl) {
        if (!this.routingHttps) {
          throw Error('Cannot register https routes without defining an ssl port');
        }

        if (!this.certificates.getCertificate(from.hostname)) {
          if ('object' === typeof ssl) {
            if (ssl.keyPath || ssl.certificatePath || ssl.caPath) {
              this.certificates.loadCertificateFromFiles(ssl.keyPath, ssl.certificatePath, ssl.caPath);
            }
            else if (ssl.letsEncrypt) {
              if (!this.letsEncrypt) {
                console.error('Missing LetsEncrypt in router configuration');
                return;
              }
              this.log && this.log.info(null, `Getting Let's Encrypt certificates for ${from.hostname}`);
              this.letsEncrypt.getLetsEncryptCertificate(
                from.hostname,
                registrationOptions.https.letsEncrypt.production,
                registrationOptions.https.letsEncrypt.email,
                registrationOptions.https.letsEncrypt.renewWithin || ONE_MONTH);
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

  public getSource = (req: http.IncomingMessage) => {
    const forwardedHost = req.headers['x-forwarded-host']

    if (this.preferForwardedHost === true && forwardedHost) {
      if (Array.isArray(forwardedHost)) {
        return forwardedHost[0].split(':')[0]
      }
      return forwardedHost.split(':')[0];
    }
    if (req.headers.host) {
      return req.headers.host.split(':')[0];
    }
  }

  public getTarget = (source: string, req: ExtendedIncomingMessage): ProxyTargetUrl => {
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
      req.url = path.join(target.pathname, req.url).replace(/\\/g, '/');
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
  protected resolve = (host: string, url?: string): Route | null => {
    // Given a url resolve it to a target route if available.
    if (!host) {
      return null;
    }

    url = url || '/';

    const routes = this.routing[host.toLowerCase()];

    if (routes) {
      if (this.letsEncrypt && /^\/.well-known\/acme-challenge/.test(url)) {
        return {
          path: '/',
          roundRobin: 0,
          targets: [{
            host: 'localhost',
            slashes: true,
            pathname: '/',
            protocol: 'http:',
            port: (this.letsEncrypt.port).toString()
          }]
        }
      }
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
    target.sslRedirect = options.https && 'object' === typeof options.https && options.https.redirect !== false;
    target.useTargetHostHeader = options.useTargetHostHeader === true;
    return target;
  };

  protected prependHttpIfRequired = (link: string): string => {
    if (link.search(/^http[s]?\:\/\//) === -1) {
      link = 'http://' + link;
    }
    return link;
  }

}
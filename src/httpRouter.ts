import http from 'http'
import httpProxy from 'http-proxy'
import path from 'path'
import Certificates from './certificates';
import { LoggerInterface } from './simpleLogger'
import LetsEncryptClient from './letsEncrypt';
import { ProxyUrl, makeUrl, startsWith, respondNotFound } from './util';
import Route from './Route'

export interface RegistrationLetsEncryptOptions {
  email: string
  production?: boolean,
  renewWithin?: number,
  forceRenew?: boolean
}

export interface RegistrationHttpsOptions {
  redirectToHttps: boolean
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  letsEncrypt?: RegistrationLetsEncryptOptions
}

export interface RouteRegistrationOptions {
  https?: RegistrationHttpsOptions,// | boolean,
  secureOutbound?: boolean
  useTargetHostHeader?: boolean
}

export interface ExtendedIncomingMessage extends http.IncomingMessage {
  host: string;
  originalUrl: string
}

export interface HTTPRouterOptions {
  proxy: httpProxy
  certificates?: Certificates
  https?: RegistrationHttpsOptions
  redirectPort?: number
  letsEncrypt?: LetsEncryptClient,
  log?: LoggerInterface
}

const defaultRegistrationOptions: RouteRegistrationOptions = {
  https: null,
  useTargetHostHeader: false
}

const ONE_DAY = 60 * 60 * 24 * 1000;
const ONE_MONTH = ONE_DAY * 30;

export default class HTTPRouter {
  protected hostname: string
  protected proxy: httpProxy
  protected certificates: Certificates
  protected https: RegistrationHttpsOptions
  protected letsEncrypt: LetsEncryptClient
  protected log: LoggerInterface
  protected redirectPort: number
  protected routes: Route[]

  constructor(hostname: string, options: HTTPRouterOptions) {
    this.hostname = hostname
    this.certificates = options.certificates
    this.proxy = options.proxy
    this.https = options.https
    this.letsEncrypt = options.letsEncrypt
    this.redirectPort = options.redirectPort
    this.routes = []
    this.log = options.log

    if (options.https) {
      this.setupCertificates(options.https)
    }
  }

  public addRoute = (
    from: Partial<URL>,
    to: string | ProxyUrl | (string | ProxyUrl)[],
    options: RouteRegistrationOptions = defaultRegistrationOptions) => {

    if (!(from = makeUrl(from)) || !to || (Array.isArray(to) && to.length === 0)) {

      throw Error('Cannot add a new route with invalid "from" or "to"');
    }

    const pathname = from.pathname

    let route: Route = this.routes.find((value) => value.path === pathname)

    if (!route) {

      // if (options.https) {
      //   this.setupCertificates(from, options)
      // }

      route = new Route(pathname)
      this.routes.push(route)
    }

    route.addTargets(to, options)

    if (route.noTargets()) {

      this.routes = this.routes.filter((value) => value !== route)
      throw Error('Cannot add a new route with invalid "from" or "to"');
    }
    //
    // Sort routes -- longer routes first
    //
    this.routes = this.routes.sort((routeA, routeB) => routeB.path.length - routeA.path.length);

    return this;
  };

  public removeRoute = (from: Partial<URL>, to?: string | ProxyUrl | (string | ProxyUrl)[]) => {

    if (!(from = makeUrl(from))) {
      return this;
    }

    const pathname = from.pathname

    const route: Route = this.routes.find((route) => route.path === pathname)

    if (route) {

      route.removeTargets(to)

      if (route.noTargets()) {

        this.routes = this.routes.filter((value) => value !== route)
      }
    }

    this.log && this.log.info({ from: from, to: to }, 'Unregistered a route');

    return this;
  }

  public noRoutes = (): boolean => {
    return this.routes.length === 0
  }

  public routeHttp = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    const target = this.getTarget(req)

    if (target) {

      if (this.shouldRedirectToHttps(target)) {
        this.redirectToHttps(req, res);
      }
      else {

        //TO DO handle errors
        this.proxy.web(req, res, { target: target, secure: target.secure },

          (error: any, req: http.IncomingMessage, res: http.ServerResponse) => {

            respondNotFound(req, res)
          });
      }
    }
    else {

      respondNotFound(req, res);
    }

  }

  public routeHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    const target = this.getTarget(req)

    if (target) {

      this.proxy.web(req, res, { target: target, secure: target.secure },

        (error: any, req: http.IncomingMessage, res: http.ServerResponse) => {

          respondNotFound(req, res)
        });
    }
    else {

      respondNotFound(req, res);
    }
  }

  private shouldRedirectToHttps = (target: ProxyUrl) => {
    return this.https
      && this.https.redirectToHttps
      && (!this.letsEncrypt || target.href != this.letsEncrypt.href)
  }

  private redirectToHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    req.url = req.originalUrl || req.url; // Get the original url since we are going to redirect.

    const targetPort = this.redirectPort;
    //TO DO check if we should use forwarded host
    const hostname = req.headers.host.split(':')[0] + (targetPort ? ':' + targetPort : '')

    const url = 'https://' + path.join(hostname, req.url).replace(/\\/g, '/')

    this.log && this.log.info(null, `Redirecting ${path.join(req.headers.host, req.url)} to ${url}`);

    //
    // We can use 301 for permanent redirect, but its bad for debugging, we may have it as
    // a configurable option.
    //

    res.writeHead(302, { Location: url });
    res.end();
  }

  protected setupCertificates = (options: RegistrationHttpsOptions) => {

    if (!this.certificates) {
      throw Error('Cannot register https routes without certificate option');
    }

    // const https: RegistrationHttpsOptions = options.https;

    if (!this.certificates.getCertificate(this.hostname)) {

      if ('object' === typeof options) {

        if (options.keyFilename || options.certificateFilename || options.caFilename) {
          this.certificates.loadCertificateFromFiles(this.hostname, options.keyFilename, options.certificateFilename, options.caFilename, false);
        }
        else if (options.letsEncrypt) {

          if (!this.letsEncrypt) {
            console.error('Missing LetsEncrypt in router configuration');
            return;
          }

          this.log && this.log.info(null, `Getting Let's Encrypt certificates for ${this.hostname}`);

          this.letsEncrypt.getLetsEncryptCertificate(
            this.hostname,
            options.letsEncrypt.production,
            options.letsEncrypt.email,
            options.letsEncrypt.renewWithin || ONE_MONTH,
            options.letsEncrypt.forceRenew);
        }
      }
      else {
        // Trigger the use of the default certificates.
        this.certificates.addCertificate(this.hostname, null)
      }
    }
  }

  public getTarget = (req: ExtendedIncomingMessage): ProxyUrl => {

    const url = req.url;

    const route: Route = this.resolve(url)

    if (!route) {

      this.log && this.log.warn({ host: req.headers.host, url: url }, 'no valid route found for given source');
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

    const target = route.nextTarget();

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
      req.headers.host = target.host;
    }

    this.log && this.log.info(null, `Proxying ${req.headers.host}${url} to ${target.href}${req.url}`)

    return target;
  }

  public getTestTarget = (url: string): ProxyUrl => {

    const route: Route = this.resolve(url)

    const Url = makeUrl(url)

    if (!route) {

      this.log && this.log.warn({ host: Url.host, url: url }, 'no valid route found for given source');
      return null;
    }

    const pathname: string = route.path;

    const target = route.nextTarget();

    //
    // Fix request url if targetname specified.
    //
    if (target.pathname) {
      url = path.join(target.pathname, url).replace(/\\/g, '/');
    }

    this.log && this.log.info(null, `Testing ${Url.host}/${url} to ${target.href}/${url}`)

    return target;
  }

  protected resolve = (url?: string): Route | null => {

    url = url || '/';

    if (this.letsEncrypt && /^\/.well-known\/acme-challenge\//.test(url)) {

      return new Route('/').addTargets(this.letsEncrypt.href, {})
    }

    return this.routes.find((route) => route.path === '/' || startsWith(url, route.path)) || null
  }
}
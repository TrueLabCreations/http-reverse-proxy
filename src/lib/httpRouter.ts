import http from 'http'
import httpProxy from 'http-proxy'
import path from 'path'
import { Certificates } from './certificates';
import { Logger } from './logger'
import { BaseLetsEncryptClient } from './letsEncrypt/letsEncrypt';
import {
  ProxyUrl,
  makeUrl,
  startsWith,
  respondNotFound,
  LongTimeout,
  setLongTimeout
} from './util';
import { Route } from './route'
import { Statistics } from './statistics';

/**
 * LetsEncrypt options when a route is registered. These options take effect
 * on the first route that is registered under a host name.
 * 
 * Subsequent calls to addRoute for the same host name with 
 * different LetsEncrypt options will be silently ignored.
 */

export interface RegistrationLetsEncryptOptions {
  email: string         // The email address used to set up the account
  production?: boolean  // If true the production server sill be used.
  // If too many failed requests are made to the
  // production servers, the account will be 
  // blocked for a period of time.
  // Only start using the production servers
  // once the requests are processed correctly
  renewWithin?: number  // Try to renew the certificate before it expires.
  // The default is 30 days (suggested by LetsEncrypt)
  // THis is in milliseconds
  forceRenew?: boolean  // When set to true the certificate will be renewed
  // without regard to it's expiration
}

/**
 * LetsEncrypt options when a route has an https server. These options take effect
 * on the first route that is registered under a host name.
 * 
 * Subsequent calls to addRoute for the same host name with 
 * different LetsEncrypt options will be silently ignored.
 */

export interface RegistrationHttpsOptions {
  redirectToHttps: boolean      // If true requests to http will be redirected to https
  keyFilename?: string          // If the host has a permanent certificate 
  // this is the absolute path to the key file (PEM)
  certificateFilename?: string  // The path to the permanent certificate file
  caFilename?: string           // The path to the permanent cs file
  letsEncrypt?: RegistrationLetsEncryptOptions // If you are using LetsEncrypt and not permanent
  // certificates, this is the configuration for this host
}

/**
 * The complete set of registration options for a route/host
 */

export interface RouteRegistrationOptions {
  https?: RegistrationHttpsOptions, // The https options for this route/host
  secureOutbound?: boolean          // If true, http-proxy will use https and check the credentials on the target(s)
  useTargetHostHeader?: boolean     // If true the router will sustitute the target host name for the
  // inbound host name in the request
  stats?: Statistics
}

/**
 * A minor extension to the http IncommingMessage.
 * Used for a littel internal bookkeepping
 */

export interface ExtendedIncomingMessage extends http.IncomingMessage {
  host: string
  originalUrl: string
}

/**
 * The set of options for the HttpRouter.
 * These a normally set by the httpReverseProxy
 */

export interface HttpRouterOptions {
  proxy: httpProxy              // The Http-proxy service
  certificates?: Certificates   // The Certificates table for LetsEncrypt
  https?: RegistrationHttpsOptions  // Options for hadling https requests
  redirectPort?: number             // Port to redirect https requests
  letsEncrypt?: BaseLetsEncryptClient,  // Instance of LetsEncrypt client
  log?: Logger
  stats?: Statistics
}

/**
 * Default options for the addRoute with no options
 */

const defaultRegistrationOptions: RouteRegistrationOptions = {
  https: null,
  useTargetHostHeader: false
}

const ONE_DAY = 60 * 60 * 24 * 1000;
const ONE_MONTH = ONE_DAY * 30;

/**
 * The HttpRouter. This handles most of the heavy lifting in the routing process
 */

export class HttpRouter {
  protected hostname: string
  protected proxy: httpProxy
  protected certificates: Certificates
  protected https: RegistrationHttpsOptions
  protected letsEncrypt: BaseLetsEncryptClient
  protected log: Logger
  protected stats: Statistics
  protected redirectPort: number
  protected routes: Route[]
  private certificateTimer: LongTimeout
  protected certificateFailureCount: number
  protected letEncryptBusy: boolean;

  /**
   * A new httpRouter requires a hostname and minimal options
   */

  constructor(hostname: string, options: HttpRouterOptions) {
    this.hostname = hostname
    this.certificates = options.certificates
    this.proxy = options.proxy
    this.https = options.https
    this.letsEncrypt = options.letsEncrypt
    this.redirectPort = options.redirectPort
    /**
     * Routes are stored iin a sorted array with the longest inbound url first.
     * This makes sure a request for server1.test.com/api comes before server1.test.api/
     */
    this.routes = []
    this.log = options.log
    this.stats = options.stats
    /**
     * The certificate timer is used to request a new certificate before the current one expires
     */
    this.certificateTimer = null
    /**
     * Too many errors requesting a new certificate will abort the process
     */
    this.certificateFailureCount = 0

    /**
     * If https is specified in the options, set up the certificates
     */
    if (options.https) {
      this.setupCertificates(options.https)
    }
  }

  /**
   * Add route consisting of the inbound url and the outbound targets 
   */

  public addRoute = (
    from: Partial<URL>,
    to: string | ProxyUrl | (string | ProxyUrl)[],
    options: RouteRegistrationOptions = defaultRegistrationOptions) => {

    /**
     * There must be a valid source url and target url(s)
     */

    if (!(from = makeUrl(from)) || !to || (Array.isArray(to) && to.length === 0)) {

      throw Error('Cannot add a new route with invalid "from" or "to"');
    }

    /**
     * Get the source (inbound) path
     */

    const pathname = from.pathname

    /**
     * See if we already have a route with that path
     */

    let route: Route = this.routes.find((value) => value.path === pathname)

    /**
     * If not, add a new Route
     */

    if (!route) {

      route = new Route(pathname, this.log, this.stats)
      this.routes.push(route)

      this.stats && this.stats.updateCount(`ActivePathsFor:${this.hostname}`, 1)

      this.stats && this.stats.updateCount(`PathsAddedFor:${this.hostname}`, 1)
    }

    /**
     * Add the targets to the route
     */

    route.addTargets(to, options)

    /**
     * Perform a sanity check on the resulting route
     */

    if (route.noTargets()) {

      this.routes = this.routes.filter((value) => value !== route)

      this.stats && this.stats.updateCount(`ActivePathsFor:${this.hostname}`, -1)
      this.stats && this.stats.updateCount(`PathsRemovedFor:${this.hostname}`, 1)

      throw Error('Cannot add a new route with invalid "from" or "to"');
    }

    /**
     * Sort routes -- longer routes first
     */

    this.routes = this.routes.sort((routeA, routeB) => routeB.path.length - routeA.path.length);

    return this;
  }

  /**
   * Remove a route from the list of targets
   */

  public removeRoute = (from: Partial<URL>, to?: string | ProxyUrl | (string | ProxyUrl)[]) => {

    if (!(from = makeUrl(from))) {
      /**
       * Nothiing to do
       */
      return this;
    }

    /**
     * Get the source (inbound) path
     */

    const pathname = from.pathname

    /**
     * See if we have a Route with that path
     */

    const route: Route = this.routes.find((route) => route.path === pathname)

    if (route) {

      /**
       * Remove the matching targets
       */

      route.removeTargets(to)

      /**
       * If the Route has no targets, remove the Route
       */

      if (route.noTargets()) {

        this.routes = this.routes.filter((value) => value !== route)

        this.stats && this.stats.updateCount(`ActivePathsFor:${this.hostname}`, -1)
        this.stats && this.stats.updateCount(`PathsRemovedFor:${this.hostname}`, 1)
      }
    }

    this.log && this.log.info({ from: from, to: to }, 'Unregistered a route');

    return this;
  }

  /**
   * Helper method to check we have routes
   */

  public noRoutes = (): boolean => {
    return this.routes.length === 0
  }

  public closeRoute = () =>{

    if (this.certificateTimer){
          
      this.certificateTimer.clearTimer()
    }
  }

  /**
   * Handle routing of http requests
   */

  public routeHttp = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    /**
     * Get a target matching the route
     */

    const target = this.getTarget(req)

    this.stats && this.stats.updateCount(`HttpRouteRequestsFor:${this.hostname}`, 1)

    /**
     * If we have a matching target we can pass the request on to http-proxy
     */

    if (target) {

      /**
       * Check if this http request should be redirected to https
       */

      if (this.shouldRedirectToHttps(target)) {

        /**
         * If so, inform the browser
         */

        this.redirectToHttps(req, res);
      }
      else {

        try {

          /**
           * Pass the request on to http-proxy. Target.secure is set by RouteRegistrationOptions.secureOutbound
           */

          this.proxy.web(req, res, { target: target, secure: target.secure },

            /**
             * If it fails, let the client know we are lost
             */

            (error: any, req: http.IncomingMessage, res: http.ServerResponse) => {

              respondNotFound(req, res)

              this.stats && this.stats.updateCount(`HttpProxyFailuresFor:${this.hostname}`, 1)
            })
        }
        catch (err) {

          respondNotFound(req, res);

          this.stats && this.stats.updateCount(`HttpProxyFailuresFor:${this.hostname}`, 1)
        }
      }
    }
    else {

      respondNotFound(req, res);

      this.stats && this.stats.updateCount(`HttpRouteFailuresFor:${this.hostname}`, 1)
    }

  }

  /**
   * Handle routing https requests
   */

  public routeHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    /**
     * Get the target matching the route
     */

    const target = this.getTarget(req)

    this.stats && this.stats.updateCount(`HttpsRouteRequestsFor:${this.hostname}`, 1)

    /**
     * If we have a matching target we can pass the request on to http-proxy
     */

    if (target) {

      try {
        // req.headers.host = target.host

        this.proxy.web(req, res, { target: target, secure: target.secure },

          (error: any, req: http.IncomingMessage, res: http.ServerResponse) => {

            respondNotFound(req, res)

            this.stats && this.stats.updateCount(`HttpsProxyFailuresFor:${this.hostname}`, 1)
          })
      }
      catch (err) {

        respondNotFound(req, res)

        this.stats && this.stats.updateCount(`HttpsProxyFailuresFor:${this.hostname}`, 1)
      }
    }
    else {

      respondNotFound(req, res);

      this.stats && this.stats.updateCount(`HttpsRouteFailuresFor:${this.hostname}`, 1)
    }
  }

  /**
   * Helper method to determine if an http request should be redirected to https
   * 
   * If we have https options and they specify http requests should be redirected
   * 
   * Then we only need to make sure this is not a request for a LetsEncrypt challenge verification
   */

  private shouldRedirectToHttps = (target: ProxyUrl) => {
    return this.https
      && this.https.redirectToHttps
      && (!this.letsEncrypt || target.href != this.letsEncrypt.href)
  }

  /**
   * Helper method to redirect the http request to https
   */

  private redirectToHttps = (req: ExtendedIncomingMessage, res: http.ServerResponse) => {

    req.url = req.originalUrl || req.url; // Get the original url since we are going to redirect.

    const targetPort = this.redirectPort;

    /**
     * Set up the redirect to use the same host and url
     */

    const hostname = this.hostname + (targetPort ? ':' + targetPort : '')

    const url = 'https://' + path.join(hostname, req.url).replace(/\\/g, '/')

    this.log && this.log.info(null, `Redirecting ${path.join(req.headers.host, req.url)} to ${url}`);

    //
    // We can use 301 for permanent redirect, but its bad for debugging, we may have it as
    // a configurable option.
    //

    res.writeHead(302, { Location: url });
    res.end();

    this.stats && this.stats.updateCount(`HttpRedirectsFor:${this.hostname}`, 1)
  }

  /**
   * Set up the certificateTimer to fire when the Letsencrypt certificate gets too old
   * 
   * When the timer fires, a new certificate is requested
   */

  private setCertificateExpiration = (expiresOn: Date, renewWithin: number = ONE_MONTH) => {

    /**
     * If the timer is already set, ignore this request
     */

    if (this.certificateTimer) {

      return
    }

    let expiration = expiresOn ? expiresOn.valueOf() - Date.now() - renewWithin : 0

    /**
     * If we are already overdue, wait at least a minute
     */

    if (expiration <= 0) {

      expiration = 60000
    }

    this.certificateTimer = setLongTimeout(async () => {

      /**
       * Clear the certificate timer. It will be set by the request for a certificate
       */

      this.certificateTimer = null

      /**
       * If we get the certificate, we are done
       */

      if (await this.letsEncrypt.getLetsEncryptCertificate(
        this.hostname,
        this.https.letsEncrypt.production,
        this.https.letsEncrypt.email,
        true, this.setCertificateExpiration
      )) {

        this.certificateFailureCount = 0
      }
      else {

        /**
         * Do not allow unlimited failures
         */

        if (++this.certificateFailureCount > 5) {

          this.log && this.log.error({ hostname: this.hostname }, 'LetsEncrypt get certificate aborted')
          this.stats && this.stats.updateCount(`LetsEncryptCertificateAborted: ${this.hostname}`, 1)
        }
        else {

          this.log && this.log.error({ hostname: this.hostname }, 'LetsEncrypt get certificate failed')
          this.stats && this.stats.updateCount(`LetsEncryptCertificateFailed: ${this.hostname}`, 1)

          /**
           * If we have a certificate (expiresOn not null), try again tomorrow
           * Otherwise we will try again in 10 seconds.
           */

          this.setCertificateExpiration(expiresOn, ONE_MONTH - this.certificateFailureCount * ONE_DAY)
        }
      }
    }, expiration)
  }

  /**
   * Set up the certificates for this route/hostname
   */

  protected setupCertificates = async (options: RegistrationHttpsOptions) => {

    if (!this.certificates) {

      throw Error('Cannot register https routes without certificate option');
    }

    /**
     * If we do not have a certificate see if we can request one
     */

    if (!this.certificates.getCertificate(this.hostname)) {

      if ('object' === typeof options) {

        if (options.keyFilename || options.certificateFilename || options.caFilename) {

          /**
           * We are using permanent certificates for this route/host
           */

          if (this.certificates.loadCertificateFromFiles(
            this.hostname, options.keyFilename, options.certificateFilename, options.caFilename)) {

            this.stats && this.stats.updateCount(`CertificatesLoadedFor:${this.hostname}`, 1)
          }
          else {

            this.stats && this.stats.updateCount(`CertificatesMissing:${this.hostname}`, 1)

            this.log && this.log.error({ hostname: this.hostname }, 'Missing cerrtificate files')
          }
        }
        else if (options.letsEncrypt) {

          /**
           * Set up for a temporary certificate
           */

          if (!this.letsEncrypt) {

            /**
             * We have a configuration issue
             */

            this.log && this.log.error({ hostname: this.hostname }, 'Missing LetsEncrypt in router configuration')
            return
          }

          /**
           * Test to see if another route is already working on it.
           * Requesting a certificate is an asynchronous process.
           */

          if (this.letEncryptBusy) {

            return
          }

          this.letEncryptBusy = true

          this.log && this.log.info(null, `Getting Let's Encrypt certificates for ${this.hostname}`)

          this.stats && this.stats.updateCount(`CertificateRequestsFor:${this.hostname}`, 1)

          /**
           * See if LetsEncrypt can get us a certificate
           */

          if (!await this.letsEncrypt.getLetsEncryptCertificate(
            this.hostname,
            options.letsEncrypt.production,
            options.letsEncrypt.email,
            options.letsEncrypt.forceRenew, this.setCertificateExpiration)) {

            /**
             * If we fail schedule a retry in 60 seconds
             */

            this.log && this.log.warn({ hostname: this.hostname }, 'Initial certificate request failed')
            this.stats && this.stats.updateCount(`FailedCertificateRequestsFor: ${this.hostname}`, 1)

            this.setCertificateExpiration(new Date(Date.now() + 120000), 60000)

          }

          this.letEncryptBusy = false
        }
      }
      else {
        // Trigger the use of the default certificates.
        this.certificates.addCertificate(this.hostname, null)
      }
    }
  }

  /**
   * Dig through the Routes to find an appropriate Route and target
   */

  public getTarget = (req: ExtendedIncomingMessage): ProxyUrl => {

    const url = req.url

    /**
     * Try to resolve the route
     */

    const route: Route = this.resolve(url)

    if (!route) {

      this.stats && this.stats.updateCount(`TargetFailuresFor:${this.hostname}`, 1)
      this.log && this.log.warn({ host: req.headers.host, url: url }, 'no valid route found for given source');

      return null;
    }

    /**
     * Fix up the source path
     */

    const pathname: string = route.path;

    if (pathname.length > 1) {

      /**
       * Save the original url for later.
       * Remove the prefix specified in Route from the request Url
       * Leaving just the remaining part
        * Route.url === '/abc'
        * req.url === '/abc/def'
        * req.url = '/def'
      */

      req.originalUrl = url; // save original url
      req.url = url.substr(pathname.length) || '/';
    }

    /**
     * Get the next target in the route
     */

    const target = route.nextTarget();

    /**
     * Fix request url if target pathname is specified.
     * Append the remainder of the req.url to the target path
       * Route.url === '/abc'
       * req.url === '/abc/def'
       * target.url === '/123'
       * req.url = '/123/def'
     */

    if (target.pathname) {

      req.url = path.join(target.pathname, req.url).replace(/\\/g, '/');
    }

    /**
     * Host headers are passed through from the source by default
     * We may want to use the host header of the target instead
     * specifically if we have proxies behind us
     * or servers that check the host name matches their own
     */

    if (target.useTargetHostHeader === true) {

      req.headers.host = target.host;
    }

    this.stats && this.stats.updateCount(`TargetRequestsFor:${this.hostname}${pathname} to ${target.host}${target.pathname}`, 1)
    this.log && this.log.info(null, `Proxying ${req.headers.host}${pathname} to ${target.href}${target.pathname}`)

    return target;
  }

  /**
   * For Mocha testing only
   */

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

  /**
   * Search the Routes for one that matches the inbound request
   */

  protected resolve = (url?: string): Route | null => {

    this.stats && this.stats.updateCount(`RouteResolutionsFor:${this.hostname}`, 1)

    url = url || '/';

    /**
     * This is a hack.
     * 
     * If we are looking for the LetsEncrypt server, pass back an uregistered Route
     */

    if (this.letsEncrypt && /^\/.well-known\/acme-challenge\//.test(url)) {

      this.log && this.log.info(null, `Adding LetsEncrypt Route ${url}`)
      this.stats && this.stats.updateCount(`AcmeRequestsFor:${this.hostname}`, 1)

      return new Route('/').addTargets(this.letsEncrypt.href, {})
    }

    /**
     * Look for the first Route that matches the inbound URL
     * 
     * Since the Routes are sorted with the longest first, we will find the most accurate match
     */

    return this.routes.find((route) => route.path === '/' || startsWith(url, route.path)) || null
  }
}

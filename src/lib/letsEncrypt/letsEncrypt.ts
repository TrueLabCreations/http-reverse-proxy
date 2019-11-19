import http from 'http'
import cluster from 'cluster'
import { Certificates, CertificateInformation } from "../certificates";
import { BaseDNSUpdate } from "../dns/dnsUpdate";
import { Logger } from "../logger";
import { ClusterMessage } from '../httpReverseProxy';
import { Statistics } from '../statistics';

/**
 * The base Let's Encrypt options
 * 
 * The base class instantiates an http server to respond to the Http-01 challenges
 * The port and host are used by the server
 * 
 * The dnsChallenge is the interface to a particular DNS server 
 * when you need to support a dns-01 challenge.
 * 
 * The dnsNameServer is optional. If specified it is the ip address of the DNS nameserver.
 * When specified the DNS challenge will query the nameserver to make sure the
 * update to the TXT record has propagated to the server specified
 */

export interface BaseLetsEncryptOptions {
  port?: number
  host?: string
  certificates?: Certificates
  dnsChallenge?: BaseDNSUpdate
  // dnsNameServer?: string
  log?: Logger
  stats?: Statistics
}

/**
 * The http-01 challenge table is a simple object with host name and modified tokens as keys 
 * and the challenge response as the value
 */

interface HttpChallengeTable {
  [hostAndToken: string]: string
}

/**
 * For clustered environment the challenges are distributed to all of the 
 * cluster workers through messages handled by the cluster master
 */

export interface LetsEncryptMessage extends ClusterMessage {

  host: string
  token: string
  keyAuthorization?: string
}

/**
 * THis is the base class for the specific implentation of 
 * the Let's Encrypt Acme challenge handlers.
 * 
 * It instantiates the Http server to handle the http01 challenges
 */

export class BaseLetsEncryptClient {

  protected certificates: Certificates
  protected networkInterface: string
  protected port: number
  protected httpServer: http.Server
  protected dnsChallenge: BaseDNSUpdate
  // protected dnsNameServer: string
  protected log: Logger
  protected stats: Statistics
  protected outstandingChallenges: HttpChallengeTable


  constructor(options: BaseLetsEncryptOptions) {
    this.certificates = options.certificates
    this.networkInterface = options.host
    this.port = options.port || 3000
    this.httpServer = this.setupLetsEncryptServer()
    this.dnsChallenge = options.dnsChallenge
    // this.dnsNameServer = options.dnsNameServer
    this.log = options.log
    this.stats = options.stats
    this.outstandingChallenges = {}
  }

  /**
   * This method should be overwritten by new implementations.
   * See the letsEncryptAcmeClient for details
   */

  protected getNewCertificate = async (
    host: string,
    production: boolean,
    email: string): Promise<boolean> => {

    return false
  }

  public get href() {
    return `http://${this.networkInterface || 'localhost'}:${this.port}/.well-known/acme-challenge`
  }

  public get serverInterface() {
    return this.networkInterface
  }

  public get serverPort() {
    return this.port
  }

  /**
   * Start an Http server to process the challenges from Let's Encrypt
   */

  private setupLetsEncryptServer = (): http.Server => {

    const server = http.createServer()

    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {

      this.log && this.log.info(null, `LetsEncypt validate url: ${req.url}`)

      /**
       * The server will be accessable from the outside 
       * so care must be taken to only respond to valid Urls and tokens
       */

      const validPath = /^\/.well-known\/acme-challenge\//.test(req.url)

      if (validPath) {

        /**
         * trim white space, 
         * strip trailing /, 
         * split into array on /, 
         * take last item, 
         * remove invalid identifier characters 
         */

        const token = req.url.trim().replace(/$\//, '').split('/').pop().replace(/\W-/g, '')

        this.log && this.log.info({ token: token }, `LetsEncrypt validating challenge`)

        if (token && this.outstandingChallenges[`${req.headers.host}_${token}`]) {

          // send the key corresponding to the token from the outstanding challenges

          res.writeHead(200);
          res.end(this.outstandingChallenges[`${req.headers.host}_${token}`])

          return
        }
      }

      // respond with error if missing challenge path, token, or token is not in in outstanding challenges

      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("404 Not Found\n")
    })

    server.on('listening', () => {

      const serverAddress = server.address()

      this.stats && this.stats.updateCount('LetsEncryptServersStarted', 1)
      this.stats && this.stats.updateCount('LetsEncryptServersRunning', 1)

      this.log && this.log.info(serverAddress,
        `LetsEncrypt server listening to Http requests`);
    })

    server.listen(this.port, this.networkInterface)

    return server;
  }

  /**
   * Shut down the server to allow for a clean shutdown of the proxy
   */

  public close = () => {

    this.stats && this.stats.updateCount('LetsEncryptServersRunning', -1)

    this.httpServer && this.httpServer.close()
  }

  /**
   * This is the entry point for requesting a new certificate.
   * 
   * The production parameter should be false during early testing. Too many requests to the
   * production servers will disable the account for a period of time.
   * 
   * ForceRenew will ignore the expiration of an existing certificate and request a new certificate.
   * 
   * setExpiration is a callback to allow the calling code to monitor the expiration date of the
   * certificate and request a new one before it expires
   */

  public getLetsEncryptCertificate = async (hostname: string, production: boolean, email: string,
    forceRenew?: boolean, setExpiration?: (expiresOn: Date) => void): Promise<boolean> => {

    /**
     * Initiate the callback if required
     */

    const updateExpiration = () => {

      if ('function' === typeof setExpiration) {

        const certificateData: CertificateInformation = this.certificates.getCertificateInformation(hostname)
        setExpiration(certificateData.expiresOn)
      }
    }

    this.stats && this.stats.updateCount('LetsEncryptCertificateRequests', 1)

    /**
     * First try to load the certificate from the store
     */

    if (this.certificates.loadCertificateFromStore(hostname) && !forceRenew) {

      this.stats && this.stats.updateCount('LetsEncryptCertificatesLoaded', 1)

      updateExpiration()
      return true
    }

    /**
     * If we are operating in a cluster then there are many of these processes running.
     * Care must be taken to limit the number of requests for a certificate from multiple
     * processes.
     */

    if (cluster.isWorker) {

      /**
       * If we have a certificate and we are forcing a new one, then do a little bookkeeping to
       * determine if another process beat us to it.
       */

      let certificateData: CertificateInformation = this.certificates.getCertificateInformation(hostname)
      const expiration = certificateData && certificateData.expiresOn

      /**
       * set a random delay to avoid startup race condition
       * with all of the processes trying to aquire expired or missing
       * certificates
       */

      await new Promise((resolve) => {

        setTimeout(resolve, Math.random() * 60000)
      })

      /**
       * If the certificate expiration has changed, another process has already updated it.
       */

      if (expiration &&
        this.certificates.getCertificateInformation(hostname) &&
        this.certificates.getCertificateInformation(hostname).expiresOn > expiration) {

        this.stats && this.stats.updateCount('LetsEncryptCertificatesRemotelyResolved', 1)

        updateExpiration()

        return true
      }
    }

    /**
     * Request a new certificate from the implementation of this instance
     */

    this.stats && this.stats.updateCount('LetsEncryptNewCertificateRequests', 1)

    this.log && this.log.warn({ hostname: hostname }, 'Getting new LetsEncrypt certificate')

    if (await this.getNewCertificate(hostname, production, email)) {

      this.log && this.log.warn({ hostname: hostname }, 'New LetsEncrypt certificate received')

      updateExpiration()

      return true

    }

    return false
  }

  /**
   * Helper function to turn the hostname and token into a key for the certiciate table
   */

  private makeKey = (hostname: string, token: string): string => {

    return `${hostname}_${token.replace(/\W-/g, '')}`
  }

  /**
   * The getNewCertificate method will use this method to add a challenge to the table.
   * 
   * If we are working in a cluster the update is sent to the master process to be routed to
   * all of the worker processes
   */

  protected addChallenge = (host: string, token: string, keyAuthorization: string) => {

    if (cluster.isWorker) {

      cluster.worker.send({

        messageType: 'letEncrypt',
        action: 'addChallenge',
        host: host,
        token: token,
        keyAuthorization: keyAuthorization

      } as LetsEncryptMessage)
    }
    else {

      this.stats && this.stats.updateCount('LetsEncryptHttpChallengesAdded', 1)

      this.outstandingChallenges[this.makeKey(host, token)] = keyAuthorization
    }
  }

  /**
   * Once a challenge is complete, remove it.
   * 
   * If we are working in a cluster the update is sent to the master process to be routed to
   * all of the worker processes
   */

  protected removeChallenge = (host: string, token: string) => {

    if (cluster.isWorker) {

      this.stats && this.stats.updateCount('LetsEncryptMessagesSent', 1)

      cluster.worker.send({

        messageType: 'letEncrypt',
        action: 'removeChallenge',
        host: host,
        token: token

      } as LetsEncryptMessage)
    }
    else {

      this.stats && this.stats.updateCount('LetsEncryptHttpChallengesRemoved', 1)

      delete this.outstandingChallenges[this.makeKey(host, token)]
    }
  }

  /**
   * If we are working in a cluster messages will arrive from the server to update
   * the table. Process the Add and Remove messages. This method is called by the master
   * process with any challenge messages it receives
   */

  public processMessage = (message: LetsEncryptMessage) => {

    if (message.messageType === 'letEncrypt') {

      this.stats && this.stats.updateCount('LetsEncryptMessagesReceived', 1)

      switch (message.action) {

        case 'addChallenge':

          this.stats && this.stats.updateCount('LetsEncryptHttpChallengesAdded', 1)

          this.outstandingChallenges[this.makeKey(message.host, message.token)] = message.keyAuthorization
          break

        case 'removeChallenge':

          this.stats && this.stats.updateCount('LetsEncryptHttpChallengesRemoved', 1)

          delete this.outstandingChallenges[this.makeKey(message.host, message.token)]
          break

        default:

          break
      }
    }
  }
}
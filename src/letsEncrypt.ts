import http from 'http'
import cluster from 'cluster'
import Certificates, { CertificateInformation } from "./certificates";
import AbstractDNSUpdate from "./dnsUpdate";
import { LoggerInterface } from "./simpleLogger";
import { ClusterMessage } from './httpReverseProxy';
import Statistics from './statistics';

export interface BaseLetsEncryptOptions {
  networkInterface?: string
  port?: number
  certificates?: Certificates
  dnsChallenge?: AbstractDNSUpdate
  dnsNameServer?: string
  log?: LoggerInterface
  stats?: Statistics
}

interface HTTPChallengeTable {
  [hostAndToken: string]: string
}

export interface LetsEncryptMessage extends ClusterMessage {

  host: string
  token: string
  keyAuthorization?: string
}

const oneMonth = 30 * 24 * 60 * 60 * 1000

export default class BaseLetsEncryptClient {
  protected certificates: Certificates
  protected networkInterface: string
  protected port: number
  protected httpServer: http.Server
  protected dnsChallenge: AbstractDNSUpdate
  protected dnsNameServer: string
  protected log: LoggerInterface
  protected stats: Statistics
  protected outstandingChallenges: HTTPChallengeTable


  constructor(options: BaseLetsEncryptOptions) {
    this.certificates = options.certificates
    this.networkInterface = options.networkInterface
    this.port = options.port || 3000
    this.httpServer = this.setupLetsEncryptServer()
    this.dnsChallenge = options.dnsChallenge
    this.dnsNameServer = options.dnsNameServer
    this.log = options.log
    this.stats = options.stats
    this.outstandingChallenges = {}
  }

  /**
   * This method should be overwritten by new implementations
   */

  protected getNewCertificate = async (
    host: string,
    production: boolean,
    email: string): Promise<boolean> => {

    return false
  }

  public get href() {
    return `http://${this.networkInterface}:${this.port}/.well-known/acme-challenge`
  }

  public get serverInterface() {
    return this.networkInterface
  }

  public get serverPort() {
    return this.port
  }

  private setupLetsEncryptServer = (): http.Server => {

    const server = http.createServer()

    server.on('connection', (req: http.IncomingMessage, res: http.ServerResponse) => {

      this.log && this.log.info(null, `LetsEncypt validate url: ${req.url}`)

      const validPath = /^\/.well-known\/acme-challenge\//.test(req.url)

      /**
       * trim white space, 
       * strip trailing /, 
       * split into array on /, 
       * take last item, 
       * remove invalid identifier characters 
       */

      const token = req.url.trim().replace(/$\//, '').split('/').pop().replace(/\W-/g, '')

      this.log && this.log.info({ token: token }, `LetsEncrypt validating challenge`)

      // respond with error if missing challenge path, token, or token is not in in outstanding challenges

      if (!validPath || !token || !this.outstandingChallenges[`${req.headers.host}_${token}`]) {

        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("404 Token Not Found\n")

        return
      }

      // send the key corresponding to the token from the outstanding challenges

      res.writeHead(200);
      res.end(this.outstandingChallenges[`${req.headers.host}_${token}`])
    })

    server.on('listening', () => {

      const serverAddress = server.address()

      this.stats && this.stats.updateCount('LetsEncryptServersStarted', 1)
      this.stats && this.stats.updateCount('LetsEncryptServersRunning', 1)

      this.log && this.log.info(serverAddress,
        `LetsEncrypt server listening to HTTP requests`);
    })

    server.listen(this.port, this.networkInterface)

    return server;
  }

  public close = () => {

    this.stats && this.stats.updateCount('LetsEncryptServersRunning', -1)

    this.httpServer && this.httpServer.close()
  }

  public getLetsEncryptCertificate = async (host: string, production: boolean, email: string,
    renewWithin: number = oneMonth, forceRenew?: boolean): Promise<boolean> => {

    this.stats && this.stats.updateCount('LetsEncryptCertificateRequests', 1)

    if (this.certificates.loadCertificateFromStore(host, true) && !forceRenew) {

      const certificateData: CertificateInformation = this.certificates.getCertificateInformation(host)

      if (certificateData && certificateData.expiresOn &&
        certificateData.expiresOn.valueOf() > new Date().valueOf() + renewWithin) {

        return true
      }
    }

    /**
     * set a random delay to avoid startup race condition
     * with all of the processes trying to aquire expired or missing
     * certificates
     */

    if (cluster.isWorker) {

      this.certificates.removeCertificate(host)

      await new Promise((resolve) => {

        setTimeout(resolve, Math.random() * 60000)
      })

      if (this.certificates.getCertificate(host)) {

        this.stats && this.stats.updateCount('LetsEncryptCertificatesRemotelyResolved', 1)
        
        return true
      }
    }

    this.stats && this.stats.updateCount('LetsEncryptNewCertificateRequests', 1)

    return this.getNewCertificate(host, production, email)
  }

  private makeKey = (host: string, token: string): string => {

    return `${host}_${token.replace(/\W-/g, '')}`
  }

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
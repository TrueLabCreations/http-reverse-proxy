import http from 'http'
import Certificates, { CertificateInformation } from "./certificates";
import AbstractDNSUpdate from "./dnsUpdate";
import { LoggerInterface } from "./simpleLogger";

export interface BaseLetsEncryptOptions {
  networkInterface?: string
  port?: number
  certificates?: Certificates
  dnsChallenge?: AbstractDNSUpdate
  dnsNameServer?: string
  log?: LoggerInterface
}

interface HTTPChallengeTable {
  [hostAndToken: string]: string
}

const oneMonth = 30 * 24 * 60 * 60 * 1000

export default class BaseLetsEncryptClient {
  protected certificates: Certificates
  protected log: LoggerInterface
  protected networkInterface: string
  protected port: number
  protected httpServer: http.Server
  protected dnsChallenge: AbstractDNSUpdate
  protected dnsNameServer: string
  protected outstandingChallenges: HTTPChallengeTable

  constructor(options: BaseLetsEncryptOptions) {
    this.log = options.log
    this.certificates = options.certificates
    this.networkInterface = options.networkInterface 
    this.port = options.port || 3000
    this.httpServer = this.setupLetsEncryptServer()
    this.dnsChallenge = options.dnsChallenge
    this.dnsNameServer = options.dnsNameServer
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

  public get serverInterface (){
    return this.networkInterface
  }

  public get serverPort() {
    return this.port
  }

  private setupLetsEncryptServer = (): http.Server => {

    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {

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
      this.log && this.log.info(serverAddress,
        `LetsEncrypt server listening to HTTP requests`);
    })

    server.listen(this.port, this.networkInterface)

    return server;
  }

  public close = () => {
    this.httpServer && this.httpServer.close()
  }

  public getLetsEncryptCertificate = async (host: string, production: boolean, email: string,
    renewWithin: number = oneMonth, forceRenew?: boolean): Promise<boolean> => {

    if (!forceRenew && this.certificates.loadCertificateFromStore(host, true)) {
      const certificateData: CertificateInformation = this.certificates.getCertificateInformation(host)
      if (certificateData && certificateData.expiresOn &&
        certificateData.expiresOn.valueOf() > new Date().valueOf() + renewWithin) {
        return true
      }
    }
    return this.getNewCertificate(host, production, email)
  };
}
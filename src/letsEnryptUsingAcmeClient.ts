/** 
 * @namespace LetsEncryptUsingAcmeClient
*/

import http from 'http'
import dns, { Resolver } from 'dns'
import acmeClient, { Http01Challenge, Dns01Challenge, Challenge } from 'acme-client'
import Certificates, { CertificateInformation } from './certificates'
import { CsrOptions } from 'acme-client/crypto/forge'
import GoDaddyDNSUpdate from './goDaddyDNSUpdate'

/**
 * @interface LetsEncryptServerOptions
 * @property serverInterface {string?} optional network interface for server. default: all interfaces
 * @property serverPort {number?} optional network port to listen on. default: 3000
 * @property certificates {Certificates} in-memory certificate manager
 * @property noVerify {boolean?} optional turn off the internal verification of the token/key with the server
 * @property log {SimpleLogger} optional logging facilty 
 */

export interface LetsEncryptServerOptions {
  serverInterface?: string
  serverPort?: number
  certificates: Certificates
  dnsChallenge?: GoDaddyDNSUpdate
  noVerify?: boolean
  log?: any
}

interface ChallengeTable {
  [token: string]: string
}

const oneMonth = 30 * 24 * 60 * 60 * 1000

export default class LetsEncryptUsingAcmeClient {

  protected certificates: Certificates
  protected log: any
  protected serverInterface: string
  protected serverPort: number
  protected httpServer: http.Server
  protected dnsChallenge: GoDaddyDNSUpdate
  protected noVerify: boolean
  protected outstandingChallenges: ChallengeTable

  public get href() {
    return `http://${this.serverInterface}:${this.serverPort}`
  }

  public get port() {
    return this.port
  }

  constructor(options: LetsEncryptServerOptions) {
    this.log = options.log
    this.certificates = options.certificates
    this.serverInterface = options.serverInterface
    this.serverPort = options.serverPort || 3000
    this.httpServer = this.setupLetsEncryptServer()
    this.dnsChallenge = options.dnsChallenge
    this.noVerify = options.noVerify
    this.outstandingChallenges = {}
  }

  private setupLetsEncryptServer = (): http.Server => {

    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {

      this.log && this.log.info(null, `LetsEncypt validate url: ${req.url}`)

      const validPath = /^\/.well-known\/acme-challenge\//.test(req.url)

      /**
       * trim white space, strip trailing /, split into array on /, take last item, remove invalid identifier characters 
       */

      const token = req.url.trim().replace(/$\//, '').split('/').pop().replace(/\W-/g, '')

      this.log && this.log.info(null, `LetsEncrypt validating challenge ${token}`)

      // respond with error if missing challenge path, token, or token is in in outstanding challenges

      if (!validPath || !token || !this.outstandingChallenges[`${req.headers.host}_${token}`]) {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("404 Token Not Found\n")
        return
      }

      // send the key corresponding to the token from the outstanding challenges

      res.writeHead(200);
      res.write(this.outstandingChallenges[`${req.headers.host}_${token}`])
      res.end()
    })

    server.on('listening', () => {
      const serverAddress = server.address()
      this.log && this.log.info(serverAddress,
        `LetsEncrypt server listening to HTTP requests`);
    })

    server.listen(this.serverPort, this.serverInterface)

    return server;
  }

  public close = () => {
    this.httpServer && this.httpServer.close()
  }

  public getLetsEncryptCertificate = async (domain: string, production: boolean, email: string,
    renewWithin: number = oneMonth, forceRenew?: boolean): Promise<boolean> => {

    if (!forceRenew && this.certificates.loadCertificateFromStore(domain, true)) {
      const certificateData: CertificateInformation = this.certificates.getCertificateInformation(domain)
      if (certificateData && certificateData.expiresOn &&
        certificateData.expiresOn.valueOf() > new Date().valueOf() + renewWithin) {
        return true
      }
    }
    return this.getNewCertificate(domain, production, email)
  };

  protected getNewCertificate = async (host: string, production: boolean, email: string): Promise<boolean> => {
    this.log && this.log.info({ host: host, production: production, email: email }, 'Requesting new certificate from LetsEncrypt')

    let returnResult = true
    const clientOptions: acmeClient.Options = {
      directoryUrl: production ? acmeClient.directory.letsencrypt.production : acmeClient.directory.letsencrypt.staging,
      accountKey: await acmeClient.forge.createPrivateKey()
    }

    const orderRequest: acmeClient.CreateOrderRequest = {
      identifiers: [{ type: 'dns', value: host }]
    }

    const client: acmeClient.Client = new acmeClient.Client(clientOptions)

    const account: acmeClient.Account = await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:' + email]
    })

    const order: acmeClient.Order = await client.createOrder(orderRequest)

    const authorizations: acmeClient.Authorization[] = await client.getAuthorizations(order)

    const authorization = authorizations[0]

    const { challenges } = authorization

    let challenge = challenges[0] // .find((challenge) => challenge.type === 'http-01')

    const keyAuthorization: string = await client.getChallengeKeyAuthorization(challenge)

    this.log && this.log.info({ ...challenge, key: keyAuthorization }, 'LetsEncryt adding challenge')

    if (! await this.addChallenge(challenge, host, keyAuthorization))
      return false;

    try {
      if (!this.noVerify)
        await client.verifyChallenge(authorization, challenge)

      await client.completeChallenge(challenge)

      await client.waitForValidStatus(challenge)
    }
    catch (e) {
      this.log && this.log.error(null, 'New certificate from LetsEncrypt failed')

      returnResult = false
    }
    finally {
      try {
        // this.removeChallenge(challenge, host)
      }
      catch (e) {
      }
    }

    if (!returnResult)
      return false

    const csrOptions: CsrOptions = {
      commonName: host
    }

    const [key, csr] = await acmeClient.forge.createCsr(csrOptions)
    await client.finalizeOrder(order, csr);
    const certificate: string = await client.getCertificate(order);

    this.certificates.saveCertificateToStore(host, key.toString(), certificate)
    this.certificates.loadCertificateFromStore(host, true)

    this.log && this.log.info({
      host: host,
      production: production,
      email: email
    },
      'New certificate from LetsEncrypt succeeded')

    return true
  }

  protected addChallenge = async (
    challenge: Challenge,
    host: string,
    keyAuthorization: string): Promise<boolean> => {

    const waitForIt = async (attempts: number): Promise<boolean> => {
      while (attempts > 0) {
        try {
          const resolve = new dns.promises.Resolver()
          resolve.setServers(['97.74.105.6'])
          const result = await resolve.resolveTxt(`_acme-challenge.${host.replace(/\*\./g, '')}`)
          const records = [].concat(...result)
          if (records.indexOf(keyAuthorization) >= 0)
            return true
        }
        finally {
          if (--attempts > 0) {
            await new Promise((resolve) => {
              setTimeout(() => {
                resolve()
              }, 1000)
            })
          }
        }
      }
      return false
    }

    switch (challenge.type) {
      case 'http-01':
        const key = `${host}_${(challenge as Http01Challenge).token.replace(/\W-/g, '')}`
        this.outstandingChallenges[key] = keyAuthorization
        return true
      case 'dns-01':
        if (this.dnsChallenge) {
          if (await this.dnsChallenge.addAcmeChallengeToDNS(host.replace(/\*\./g, ''), keyAuthorization)) {
            if (await waitForIt(5)){
              this.log && this.log.info(null, 'Resolved')
              return true
            }
          }
        }
        return false
      default:
        return false
    }
  }

  protected removeChallenge = async (
    challenge: Challenge,
    host: string): Promise<boolean> => {

    switch (challenge.type) {
      case 'http-01':
        const key = `${host}_${(challenge as Http01Challenge).token.replace(/\W-/g, '')}`
        delete this.outstandingChallenges[key]
        return true
      case 'dns-01':
        return this.dnsChallenge &&
          await this.dnsChallenge.removeAcmeChallengeFromDNS(host.replace(/\*\./g, ''))
      default:
        return false
    }
  }
}
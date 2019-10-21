import http from 'http'
// import fs from 'fs'
import acmeClient from 'acme-client'
import Certificates, { CertificateInformation } from './certificates'
import { CsrOptions } from 'acme-client/crypto/forge'
import { AddressInfo } from 'net'
// import { parse as urlParse } from 'url'
// import path from 'path'

export interface LetsEncryptServerOptions {
  serverInterface?: string
  serverPort?: number
  certificates: Certificates
  // challengePath: string
  log?: any
}

interface ChallengeTable {
  [token: string]:string
}

export default class LetsEncryptUsingAcmeClient {

  // protected options: LetsEncryptServerOptions
  protected certificates: Certificates
  // protected challengePath: string
  protected log: any
  protected serverInterface: string
  protected serverPort: number
  protected httpServer: http.Server
  protected static outstandingChallenges:ChallengeTable = {}

  public get href(){
    return `http://${this.serverInterface}:${this.serverPort}`
  }

  public get port(){
    return this.port
  }

  constructor(options: LetsEncryptServerOptions) {
    // this.outstandingChallenges = {}
    this.log = options.log
    this.certificates = options.certificates
    // this.challengePath = options.challengePath
    this.serverInterface = options.serverInterface // || 'localhost'
    this.serverPort = options.serverPort || 3000
    this.httpServer = this.setupLetsEncryptServer()
  }

  private setupLetsEncryptServer = (): http.Server => {
    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      this.log && this.log.info(null, `LetsEncypt url: ${req.url}`)
      const token = req.url.trim().replace(/$\//, '').split('/').pop().replace(/\W-/g,'')
      // const pathname = urlParse(req.url).pathname
      // const filename = path.join(this.challengePath, pathname)
      // if (pathname.length < 3 || filename.indexOf(this.challengePath) !== 0) {
      //   this.log && this.log.info(null, `LetsEncrypt invalid request for file ${filename}`)
      //   res.writeHead(403)
      //   res.end()
      //   return
      // }
      this.log && this.log.info(null, `LetsEncrypt validating challenge ${token}`)

      if (!token || !LetsEncryptUsingAcmeClient.outstandingChallenges[token]){
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.write("404 Token Not Found\n")
        res.end()
        return
      }

      // fs.stat(filename, (error: Error, stats: fs.Stats) => {
      //   if (error || !stats.isFile()) {
      //     res.writeHead(404, { "Content-Type": "text/plain" })
      //     res.write("404 Not Found\n")
      //     res.end()
      //     return
      //   }
    // })

        res.writeHead(200);
        res.write(LetsEncryptUsingAcmeClient.outstandingChallenges[token])
        res.end()
        // fs.createReadStream(filename, "binary").pipe(res);
    })
    server.listen(this.serverPort, this.serverInterface)
    
    server.on('listening',  () =>{
      const serverAddress = server.address()
      // if (serverAddress){
        this.log && this.log.info(serverAddress, 
          `LetsEncrypt server listening to HTTP requests`);
      // }
      // else{
      //   this.log && this.log.info({address:this.serverInterface, port:this.serverPort}, 
      //     `LetsEncrypt server listening to HTTP requests (null address)`);
      //  }
    })
    return server;
  }

  public getLetsEncryptCertificate = async (domain: string, production: boolean, email: string,
    renewWithin: number, forceRenew?: boolean): Promise<boolean> => {

    if (!forceRenew && this.certificates.loadCertificateFromStore(domain, true)) {
      const certificateData: CertificateInformation = this.certificates.getCertificateInformation(domain)
      if (certificateData && certificateData.expiresOn &&
        certificateData.expiresOn.valueOf() > new Date().valueOf() + renewWithin){
          // this.log && this.log.info(null, certificateData.expiresOn.toString())
          // this.log && this.log.info(null, new Date().toString())
        return true
        }
    }
    return await this.getNewCertificate(domain, production, email)
  };

  protected getNewCertificate = async (host: string, production: boolean, email: string): Promise<boolean> => {
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

    const { challenges } = authorizations[0]

    let challenge = challenges.find((challenge) => challenge.type === 'http-01')

    if (!challenge)
      return false

    // const challengePath = `${this.challengePath}/.well-known/acme-challenge`
    // const challengeFilename = `${challengePath}/${(challenge as acmeClient.Http01Challenge).token}`
    const token = (challenge as acmeClient.Http01Challenge).token.replace(/\W-/g,'')
    try {
      const keyAuthorization: string = await client.getChallengeKeyAuthorization(challenge)

      // if (! await this.mkDir(challengePath) ||
      //   ! await this.writeFile(challengeFilename, keyAuthorization))
      //   return false

      LetsEncryptUsingAcmeClient.outstandingChallenges[token] = keyAuthorization

      this.log && this.log.info({token:token, key:keyAuthorization}, 'LetsEncryt adding token and key')

      await client.verifyChallenge(authorizations[0], challenge)

      await client.completeChallenge(challenge)

      await client.waitForValidStatus(challenge)
    }
    catch (e) {
      returnResult = false
    }
    finally {
      try {
        // await this.unlink(challengeFilename);
        // delete this.outstandingChallenges[token]
      }
      catch (e) {
        return returnResult
      }
    }

    if (!returnResult)
      return returnResult

    const csrOptions: CsrOptions = {
      commonName: host
    }

    const [key, csr] = await acmeClient.forge.createCsr(csrOptions)
    await client.finalizeOrder(order, csr);
    const certificate: string = await client.getCertificate(order);

    this.certificates.saveCertificateToStore(host, key.toString(), certificate)
    this.certificates.loadCertificateFromStore(host, true)

    return true
  }

  public close = () =>{
    this.httpServer && this.httpServer.close()
  }

  // private exists = async (path: string): Promise<boolean> => {
  //   return new Promise((resolve, reject) => {
  //     fs.exists(path, (exists: boolean) => {
  //       resolve(exists)
  //     })
  //   })

  // }
  // private writeFile = async (path: string, data: any, opts = 'utf8'): Promise<boolean> => {
  //   return new Promise((resolve, reject) => {
  //     fs.writeFile(path, data, opts, (err) => {
  //       resolve(!err)
  //     })
  //   })
  // }

  // private mkDir = async (path: string, opts = { recursive: true }) => {
  //   return new Promise((resolve, reject) => {
  //     fs.mkdir(path, opts, (err) => {
  //       resolve(!err)
  //     })
  //   })
  // }

  // private unlink = async (path: string) => {
  //   return new Promise((resolve, reject) => {
  //     fs.unlink(path, (err) => {
  //       resolve(!err)
  //     })
  //   })
  // }
}
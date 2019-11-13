/** 
 * @namespace LetsEncryptUsingAcmeClient
*/

import dns from 'dns'
import acmeClient, { Http01Challenge, Challenge } from 'acme-client'
import { CsrOptions } from 'acme-client/crypto/forge'
import { BaseLetsEncryptClient, BaseLetsEncryptOptions } from './letsEncrypt'

/**
 * @interface LetsEncryptServerOptions
 * @property serverInterface {string?} optional network interface for server. default: all interfaces
 * @property serverPort {number?} optional network port to listen on. default: 3000
 * @property certificates {Certificates} in-memory certificate manager
 * @property noVerify {boolean?} optional turn off the internal verification of the token/key with the server
 * @property log {SimpleLogger} optional logging facilty 
 */

export interface LetsEncryptClientOptions extends BaseLetsEncryptOptions {
  noVerify?: boolean
}

export class LetsEncryptUsingAcmeClient extends BaseLetsEncryptClient {

  protected noVerify: boolean

  constructor(options: LetsEncryptClientOptions) {

    super(options)
    this.noVerify = options.noVerify
  }

  protected getNewCertificate = async (
    host: string,
    production: boolean,
    email: string): Promise<boolean> => {

    this.log && this.log.info(
      {
        host: host,
        production: production,
        email: email
      },
      'Requesting new certificate from LetsEncrypt')

    let returnResult = true

    this.stats && this.stats.updateCount('AcmeChallengeCertificatesRequested', 1)

    const clientOptions: acmeClient.Options = {
      directoryUrl: production ? acmeClient.directory.letsencrypt.production : acmeClient.directory.letsencrypt.staging,
      accountKey: await acmeClient.forge.createPrivateKey(),
      backoffAttempts: 10
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

    if (! await this.createChallenge(challenge, host, keyAuthorization)) {

      this.stats && this.stats.updateCount('AcmeChallengeCertificatesFailed', 1)

      return false
    }

    try {

      if (!this.noVerify) {

        await client.verifyChallenge(authorization, challenge)
      }

      await client.completeChallenge(challenge)

      await client.waitForValidStatus(challenge)
    }

    catch (e) {

      this.stats && this.stats.updateCount('AcmeChallengeCertificatesFailed', 1)
      this.log && this.log.error(null, 'New certificate from LetsEncrypt failed')

      returnResult = false
    }

    finally {

      try {

        this.destroyChallenge(challenge, host)
      }

      catch (e) {
      }
    }

    if (!returnResult) {

      return false
    }

    const csrOptions: CsrOptions = {
      commonName: host
    }

    const [key, csr] = await acmeClient.forge.createCsr(csrOptions)
    await client.finalizeOrder(order, csr);
    const certificate: string = await client.getCertificate(order);

    this.stats && this.stats.updateCount('AcmeChallengeCertificatesSucceeded', 1)

    this.certificates.saveCertificateToStore(host, key.toString(), certificate)
    this.certificates.propogateNewCredential(host, key.toString(), certificate)
    // this.certificates.removeCertificate(host)
    // this.certificates.loadCertificate(host, key.toString(), certificate)

    this.log && this.log.info({
      host: host,
      production: production,
      email: email
    },
      'New certificate from LetsEncrypt succeeded')

    return true
  }

  protected createChallenge = async (

    challenge: Challenge,
    host: string,
    keyAuthorization: string): Promise<boolean> => {

    const waitForNamseServerToUpdate = async (attempts: number): Promise<boolean> => {

      while (attempts > 0) {

        try {

          const resolve = new dns.promises.Resolver()
          resolve.setServers([this.dnsNameServer])

          const result = await resolve.resolveTxt(`_acme-challenge.${host.replace(/\*\./g, '')}`)
          const records = [].concat(...result)

          if (records.indexOf(keyAuthorization) >= 0)

            return true
        }

        catch (e) { }

        finally {

          if (--attempts > 0) {

            await new Promise((resolve) => {

              setTimeout(() => {
                resolve()
              }, 3000)

            })
          }
        }
      }
      return false
    }

    switch (challenge.type) {

      case 'http-01':

        this.addChallenge(host, (challenge as Http01Challenge).token, keyAuthorization)
        return true

      case 'dns-01':

        if (this.dnsChallenge) {

          this.stats && this.stats.updateCount('AcmeDNSChallengesRequested', 1)

          if (await this.dnsChallenge.addAcmeChallengeToDNS(host.replace(/\*\./g, ''), keyAuthorization)) {

            if (this.dnsNameServer) {

              if (await waitForNamseServerToUpdate(5)) {

                this.stats && this.stats.updateCount('AcmeDNSChallengesWritten', 1)

                this.log && this.log.info(null, `DNS challenge resolved from ${this.dnsNameServer}`)
                return true
              }
            }
            else {

              return true
            }
          }
        }

        this.stats && this.stats.updateCount('AcmeDNSChallengesFailed', 1)

        return false

      default:

        this.stats && this.stats.updateCount('AcmeUnhandledChallenges', 1)

        return false
    }
  }

  protected destroyChallenge = async (
    challenge: Challenge,
    host: string): Promise<boolean> => {

    switch (challenge.type) {

      case 'http-01':

        this.removeChallenge(host, (challenge as Http01Challenge).token)
        return true

      case 'dns-01':

        return this.dnsChallenge &&
          await this.dnsChallenge.removeAcmeChallengeFromDNS(host.replace(/\*\./g, ''))

      default:

        return false
    }
  }
}
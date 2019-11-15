/** 
 * This is the AcmeClient (https://github.com/publishlab/node-acme-client) implemtation of the Let's Encrypt client
*/

import dns from 'dns'
import acmeClient, { Http01Challenge, Challenge } from 'acme-client'
import { CsrOptions } from 'acme-client/crypto/forge'
import { BaseLetsEncryptClient, BaseLetsEncryptOptions } from './letsEncrypt'

/**
 *  LetsEncryptServerOptions inherits from BaseLetsEncryptOptions
 * 
 *  noVerify: optional switch to turn off the internal verification of the token/key with the internal server
 *      This is to avoid the problem for routers trying to twart the DNS-redis hack
 */

export interface LetsEncryptClientOptions extends BaseLetsEncryptOptions {
  noVerify?: boolean
}

/**
 * THe implementation of the Let's Encrypt interface using acme-client
 */
export class LetsEncryptUsingAcmeClient extends BaseLetsEncryptClient {

  protected noVerify: boolean

  constructor(options: LetsEncryptClientOptions) {

    super(options)
    this.noVerify = options.noVerify
  }

  /**
   * This method overrides the empty method in the base class
   */

  protected getNewCertificate = async (
    hostname: string,
    production: boolean,
    email: string): Promise<boolean> => {

    this.log && this.log.info(
      {
        host: hostname,
        production: production,
        email: email
      },
      'Requesting new certificate from LetsEncrypt')

    let returnResult = true

    this.stats && this.stats.updateCount('AcmeChallengeCertificatesRequested', 1)

    /**
     * There are a number of steps to the process. See the acme-client documentation.
     */

    const clientOptions: acmeClient.Options = {
      directoryUrl: production ? acmeClient.directory.letsencrypt.production : acmeClient.directory.letsencrypt.staging,
      accountKey: await acmeClient.forge.createPrivateKey(),
      backoffAttempts: 10
    }

    /**
     * Create an order
     */

    const orderRequest: acmeClient.CreateOrderRequest = {
      identifiers: [{ type: 'dns', value: hostname }]
    }

    const client: acmeClient.Client = new acmeClient.Client(clientOptions)

    /**
     * Create the account on Let's Encrypt
     */

    const account: acmeClient.Account = await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:' + email]
    })

    /**
     * Create the order on Let's Encrypt
     */

    const order: acmeClient.Order = await client.createOrder(orderRequest)

    /**
     * Get the list of possible challenge types
     */

    const authorizations: acmeClient.Authorization[] = await client.getAuthorizations(order)

    const authorization = authorizations[0]

    const { challenges } = authorization

    /**
     * Work with the first challenge type. It is usually the simplest (http-01)
     */

    let challenge = challenges[0]

    const keyAuthorization: string = await client.getChallengeKeyAuthorization(challenge)

    this.log && this.log.info({ ...challenge, key: keyAuthorization }, 'LetsEncryt adding challenge')

    /**
     * Update the http-01 or dns-01 challenge response
     */

    if (! await this.createChallenge(challenge, hostname, keyAuthorization)) {

      this.stats && this.stats.updateCount('AcmeChallengeCertificatesFailed', 1)

      return false
    }

    try {

      /**
       * Do not verify the challenge locally if the router will block it
       */

      if (!this.noVerify) {

        await client.verifyChallenge(authorization, challenge)
      }

      /**
       * Ask Let's Encrypt to validate the challenge
       */

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

        /**
         * Remove the challenge response
         */

        this.destroyChallenge(challenge, hostname)
      }

      catch (e) {
      }
    }

    if (!returnResult) {

      return false
    }

    const csrOptions: CsrOptions = {
      commonName: hostname
    }

    /**
     * Create the certificate signing request and private key
     */

    const [key, csr] = await acmeClient.forge.createCsr(csrOptions)

    /**
     * Finish the order
     */

    await client.finalizeOrder(order, csr);

    /**
     *  Get the certificate
     */

    const certificate: string = await client.getCertificate(order);

    this.stats && this.stats.updateCount('AcmeChallengeCertificatesSucceeded', 1)

    /**
     * Save the certificate locally (so it is available to extract the expiration date)
     * and propagate it to the other workers in the cluster
     */

    this.certificates.saveCertificateToStore(hostname, key.toString(), certificate)
    this.certificates.propagateNewCertificate(hostname, key.toString(), certificate)

    this.log && this.log.info({
      host: hostname,
      production: production,
      email: email
    },
      'New certificate from LetsEncrypt succeeded')

    return true
  }

  /**
   * Helper method to create the challenge response
   */

  protected createChallenge = async (

    challenge: Challenge,
    host: string,
    keyAuthorization: string): Promise<boolean> => {

    /** 
     * Helper function to wait for the DNS servers to update 
     */

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

        /**
         * Make sure we have a dnsChallenge implementation to work with
         */

        if (this.dnsChallenge) {

          this.stats && this.stats.updateCount('AcmeDNSChallengesRequested', 1)

          /**
           * Add the challenge to the DNS server
           */

          if (await this.dnsChallenge.addAcmeChallengeToDNS(host.replace(/\*\./g, ''), keyAuthorization)) {

            if (this.dnsNameServer) {

              /**
               * Wait for the servers to update
               */

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

  /**
   * Remove the challenge response
   */

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

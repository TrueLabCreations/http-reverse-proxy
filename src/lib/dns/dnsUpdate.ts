import dns from 'dns'
import { Logger } from "../logger";
import { Statistics } from "../statistics";

export interface BaseDNSUpdateOptions {

  dnsNameServer?: string
  dnsServerAttempts?: number
  dnsServerDelay?: number
  stats?: Statistics
  log?: Logger
}

/**
 * This is the base class for the DNS update.
 * Specific implementations extend this class to handle
 * the interaction with a particular DNS server
 */

export abstract class BaseDNSUpdate {

  protected dnsNameServer?: string
  protected dnsServerAttempts: number
  protected dnsServerdelay: number
  protected stats: Statistics
  protected log: Logger

  constructor(options: BaseDNSUpdateOptions) {
    this.dnsNameServer = options.dnsNameServer
    this.dnsServerAttempts = options.dnsServerAttempts || 5
    this.dnsServerdelay = options.dnsServerDelay || 3000
    this.stats = options.stats
    this.log = options.log
  }

  /**
   * Implement these two methods in inherited class
   */

  abstract async addAcmeChallengeToDNS(domain: string, challenge: string): Promise<boolean>
  abstract async removeAcmeChallengeFromDNS(domain: string): Promise<boolean>

  /**
   * Add a DNS challenge with verification via DNS server
   */

  public addDNSChallenge = async (domain: string, challenge: string): Promise<boolean> => {

    /**
     * Remove wildcard characters
     */

    domain = domain.replace(/\*\./g, '')

    this.stats && this.stats.updateCount(`DNSChallengesAddedFor: ${domain}`, 1)

    this.log && this.log.info({ domain: domain }, 'DNS challenge added')

    /**
     * Use the child implementation to write the challenge
     */

    if (await this.addAcmeChallengeToDNS(domain, challenge)) {

      /**
       * If requested verify the challenge has propagated in the server cluster
       */

      if (this.dnsNameServer) {

        /**
         * Wait for the servers to update
         */

        if (await this.waitForNameServerToUpdate(domain, challenge)) {

          this.stats && this.stats.updateCount('AcmeDNSChallengesWritten', 1)

          this.log && this.log.info(null, `DNS challenge resolved from ${this.dnsNameServer}`)
          return true
        }
      }
      else {

        return true
      }
    }
    else {

      this.stats && this.stats.updateCount(`DnsChallengeWriteFailedFor: ${domain}`, 1)

      this.log && this.log.warn({ domain: domain }, `Write DNS challenge failed`)

      return false
    }
  }

  /**
   * Remove the DNS challenge via the implementation
   */

  public removeDNSChallenge = async (domain: string): Promise<boolean> => {

    return this.removeAcmeChallengeFromDNS(domain.replace(/\*/g, ''))
  }

  /** 
  * Helper method to wait for the DNS servers to update 
  */

  private waitForNameServerToUpdate = async (domain: string, challenge: string): Promise<boolean> => {

    for (let attempts = 0; attempts < this.dnsServerAttempts; ++attempts) {

      try {

        const resolve = new dns.promises.Resolver()
        resolve.setServers([this.dnsNameServer])

        const result = await resolve.resolveTxt(`_acme-challenge.${domain}`)
        const records = [].concat(...result)

        if (records.indexOf(challenge) >= 0)

          return true
      }

      catch (e) {

        this.stats && this.stats.updateCount(`DNSServerVerificationErrorFor: ${domain}`, 1)

        this.log && this.log.warn({ domain: domain, error: e }, 'DNS server update verification error')
      }

      finally {

        await new Promise((resolve) => {

          setTimeout(resolve, this.dnsServerdelay)

        })
      }
    }
    return false
  }
}
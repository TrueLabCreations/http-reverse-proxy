import { SimpleLogger } from "../../examples/simpleLogger";

export interface BaseDNSUpdateOptions{
  
  log?:SimpleLogger
}

/**
 * This is the base class for the DNS update.
 * Specific implementations extend this class to handle
 * the interaction with a particular DNS server
 */

export abstract class BaseDNSUpdate{

  protected log:SimpleLogger

  constructor(options: BaseDNSUpdateOptions){
    this.log = options.log
  }

  abstract async addAcmeChallengeToDNS (domain: string, challenge: string): Promise<boolean>
  abstract async removeAcmeChallengeFromDNS (domain: string): Promise<boolean>
}
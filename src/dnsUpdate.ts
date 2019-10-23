import { LoggerInterface } from "./simpleLogger";

export interface AbstractDNSUpdateOptions{
  log?:LoggerInterface
}

export default abstract class AbstractDNSUpdate{
  protected log:LoggerInterface

  constructor(options: AbstractDNSUpdateOptions){
    this.log = options.log
  }

  abstract async addAcmeChallengeToDNS (domain: string, challenge: string): Promise<boolean>
  abstract async removeAcmeChallengeFromDNS (domain: string): Promise<boolean>
}
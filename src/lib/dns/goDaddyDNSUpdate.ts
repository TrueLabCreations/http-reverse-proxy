import axios from 'axios'
import { SimpleLogger } from '../../examples/simpleLogger'
import  { BaseDNSUpdate, BaseDNSUpdateOptions } from './dnsUpdate'

interface DNSEntry {

  type: string
  data: string
  name: string
  ttl: number
}

const goDaddyAPIRoot = 'https://api.godaddy.com/v1'

/**
 * GoDaddy requires an APIKey and secret 
 * both of which are available from their developer site
 */

export interface GoDaddyDNSUpdateOptions extends BaseDNSUpdateOptions {

  APIKey: string
  secret: string
}

/**
 * This method overrides the empty implmentation in the base class
 */

export class GoDaddyDNSUpdate extends BaseDNSUpdate{

  private apiKey: string
  private secret: string
  protected log: SimpleLogger

  constructor(options: GoDaddyDNSUpdateOptions) {

    super(options)

    this.apiKey = options.APIKey
    this.secret = options.secret
  }

  /**
   * GoDaddy requires us to read all of the TXT records, 
   * add our new record, and write back all of the TXT records
   */

  public addAcmeChallengeToDNS = async (domain: string, challenge: string): Promise<boolean> => {

    this.log && this.log.info({ domain: domain, challenge: challenge }, 'GoDaddy adding ACME challenge')
    
    const records = await this.getRecordsOfType(domain, 'TXT')

    if (Array.isArray(records)) {
    
      const txtName = `_acme-challenge`
      const index = records.findIndex((record) => record.name === txtName)

      if (index >= 0) {
    
        records.splice(index, 1)
      }

      records.push({ name: txtName, type: 'TXT', data: challenge, ttl: 600 })

      const result = await this.updateRecordsOfType(domain, 'TXT', records)
    
      this.log && this.log.debug(result, 'Update results')
    
      return result
    }
    
    return false
  }

  /**
   * Again we must read all of the TXT records, 
   * remove the challenge record, and write the rest back
   */

  public removeAcmeChallengeFromDNS = async (domain: string): Promise<boolean> => {
    
    this.log && this.log.info({domain: domain}, 'GoDaddy removing ACME challenge')
    
    const records = await this.getRecordsOfType(domain, 'TXT')
    
    if (Array.isArray(records)) {
    
      const txtName = `_acme-challenge`
      const index = records.findIndex((record) => record.name === txtName)

      if (index >= 0) {
    
        records.splice(index, 1)

        const result = await this.updateRecordsOfType(domain, 'TXT', records)
    
        this.log && this.log.debug(result, 'Update results')
    
        return result
      }

      return true
    }

    return false
  }

  /**
   * This is a helper function to read records from the GoDaddy DNS
   */

  protected getRecordsOfType = async (domain: string, type: string): Promise<DNSEntry[] | Error> => {

    this.log && this.log.info({ domain: domain, type: type }, 'GoDaddy get records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`

    return axios.get(url, {
      headers: {
        'Authorization': `sso-key ${this.apiKey}:${this.secret}`,
      }
    })
    .then((response) => {
    
      if (response.status === 200) {
    
        const body = response.data
        this.log && this.log.debug({ records: body }, 'GoDaddy result')
    
        return body
      }
      else {
    
        this.log && this.log.warn(response.data, `GoDaddy error: ${response.status}`)
    
        return []
      }
    })
    .catch((error) => {
    
      if (error.response) {
    
        this.log && this.log.warn(error.response.data, `GoDaddy read error: ${error.response.status}`)
    
        return error
      }
      else {
    
        this.log && this.log.error(error, `GoDaddy read error`)
    
        return error
      }
    })
  }

  protected updateRecordsOfType = async (domain: string, type: string, records: DNSEntry[]): Promise<boolean> => {
    
    this.log && this.log.debug(records, 'GoDaddy put records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`
    
    const options = {
    
      headers: {
    
        Authorization: `sso-key ${this.apiKey}:${this.secret}`,
        'Content-Type': 'application/json',
      }
    }

    return axios.put(url, records, options)
    
    .then((response) => {

      if (response.status === 200) {
    
        this.log && this.log.info(null, 'GoDaddy update success')
    
        return true
      }
      else {
    
        this.log && this.log.warn(response.data, `GoDaddy update error: ${response.status}`)
    
        return false
      }
    })
    .catch((error) => {
      
      if (error.response) {
    
        this.log && this.log.warn(error.response.data, `GoDaddy update error: ${error.response.status}`)
    
        return false
      }
      else {
    
        this.log && this.log.error(error, `GoDaddy update error`)
    
        return false
      }
    })
  }

  private buildGoDaddyDomainURL = (domain: string): string => {
    
    return `${goDaddyAPIRoot}/domains/${domain}`
  }
}
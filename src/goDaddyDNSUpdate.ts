import axios from 'axios'
import { LoggerInterface } from '../src/simpleLogger'
import  AbstractDNSUpdate, { AbstractDNSUpdateOptions } from './dnsUpdate'

interface DNSEntry {
  type: string
  data: string
  name: string
  ttl: number
}

const goDaddyAPIRoot = 'https://api.godaddy.com/v1'

export interface GoDaddyDNSUpdateOptions extends AbstractDNSUpdateOptions {
  APIKey: string
  secret: string
}

export default class GoDaddyDNSUpdate extends AbstractDNSUpdate{
  private apiKey: string
  private secret: string
  protected log: LoggerInterface

  constructor(options: GoDaddyDNSUpdateOptions) {
    super(options)
    this.apiKey = options.APIKey
    this.secret = options.secret
  }

  public addAcmeChallengeToDNS = async (domain: string, challenge: string): Promise<boolean> => {
    this.log && this.log.info({ challenge: challenge }, 'GoDaddy adding ACME challenge')
    const records = await this.getRecordsOfType(domain, 'TXT')
    if (Array.isArray(records)) {
      const txtName = `_acme-challenge`
      const index = records.findIndex((record) => record.name === txtName)

      if (index >= 0) {
        records.splice(index, 1)
      }

      records.push({ name: txtName, type: 'TXT', data: challenge, ttl: 600 })

      const result = await this.updateRecordsOfType(domain, 'TXT', records)
      this.log && this.log.info(result, 'Update results')
      return result
    }
    return false
  }

  public removeAcmeChallengeFromDNS = async (domain: string): Promise<boolean> => {
    this.log && this.log.info(null, 'GoDaddy removing ACME challenge')
    const records = await this.getRecordsOfType(domain, 'TXT')
    if (Array.isArray(records)) {
      const txtName = `_acme-challenge`
      const index = records.findIndex((record) => record.name === txtName)

      if (index >= 0) {
        records.splice(index, 1)

        const result = await this.updateRecordsOfType(domain, 'TXT', records)
        this.log && this.log.info(result, 'Update results')
        return result
      }
      return true
    }
    return false
  }

  protected getRecordsOfType = async (domain: string, type: string): Promise<DNSEntry[] | Error> => {

    this.log && this.log.info({ domain: domain, type: type }, 'GoDaddy get records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`

    return axios.get(url, {
      headers: {
        'Authorization': `sso-key ${this.apiKey}:${this.secret}`,
      }
    }).then((response) => {
      if (response.status === 200) {
        const body = response.data
        this.log && this.log.info({ records: body }, 'GoDaddy result')
        return body
      }
      else {
        this.log && this.log.info(response.data, `GoDaddy error: ${response.status}`)
        return []
      }
    }).catch((error) => {
      if (error.response) {
        this.log && this.log.info(error.response.data, `GoDaddy get error: ${error.response.status}`)
        return error
      }
      else {
        this.log && this.log.info(error, `GoDaddy get error`)
        return error
      }
    })
  }

  protected updateRecordsOfType = async (domain: string, type: string, records: DNSEntry[]): Promise<boolean> => {
    this.log && this.log.info(records, 'GoDaddy put records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`
    
    const options = {
      headers: {
        Authorization: `sso-key ${this.apiKey}:${this.secret}`,
        'Content-Type': 'application/json',
      }
    }

    return axios.put(url, records, options).then((response) => {

      if (response.status === 200) {
        this.log && this.log.info(null, 'GoDaddy update success')
        return true
      }
      else {
        this.log && this.log.info(response.data, `GoDaddy update error: ${response.status}`)
        return false
      }
    }).catch((error) => {
      
      if (error.response) {
        this.log && this.log.info(error.response.data, `GoDaddy update error: ${error.response.status}`)
        return false
      }
      else {
        this.log && this.log.info(error, `GoDaddy update error`)
        return false
      }
    })
  }

  private buildGoDaddyDomainURL = (domain: string): string => {
    return `${goDaddyAPIRoot}/domains/${domain}`
  }
}
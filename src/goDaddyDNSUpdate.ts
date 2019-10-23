import axios from 'axios'
import { LoggerInterface } from '../src/simpleLogger'

export interface DNSEntry {
  type: string
  data: string
  name: string
  ttl: number
}

const goDaddyAPIRoot = 'https://api.godaddy.com/v1'

export interface GoDaddyDNSUpdateOptions {
  key: string
  secret: string
  log?: LoggerInterface
}
export default class GoDaddyDNSUpdate {
  private apiKey: string
  private secret: string
  protected log: LoggerInterface

  constructor(APIKey: string, secret: string, log?: LoggerInterface) {
    this.apiKey = APIKey
    this.secret = secret
    this.log = log
  }

  protected getRecordsOfType = async (domain: string, type: string): Promise<DNSEntry[] | Error> => {

    this.log && this.log.info({ domain: domain, type: type }, 'GoDaddy get records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `sso-key ${this.apiKey}:${this.secret}`,
        }
      })
      if (response.status === 200) {
        const body = response.data
        this.log && this.log.info({ records: body }, 'GoDaddy result')
        return body
      }
      else {
        this.log && this.log.info(response.data, `GoDaddy error: ${response.status}`)
      }
    }
    catch (e) {
      this.log && this.log.info(e, 'GoDaddy Error')
      return e
    }
  }

  protected updateRecordsOfType = async (domain: string, type: string, records: DNSEntry[]): Promise<boolean> => {
    this.log && this.log.info(records, 'GoDaddy put records of type')

    const url = `${this.buildGoDaddyDomainURL(domain)}/records/${type}`
    try {
      const options = {
        headers: {
          Authorization: `sso-key ${this.apiKey}:${this.secret}`,
          'Content-Type': 'application/json',
        }
      }
      return axios.put(url, records, options).then((response) => {
        if (response.status === 200) {
          const body = response.data
          this.log && this.log.info({ records: body }, 'GoDaddy result')
          return true
        }
        else {
          this.log && this.log.info(response.data, `GoDaddy error: ${response.status}`)
          return false
        }
      }).catch((error) => {
        if (error.response) {
          this.log && this.log.info(error.response.data, `GoDaddy error: ${error.response.status}`)
          return false
        }
        else {
          this.log && this.log.info(error, `GoDaddy error`)
          return false
        }
      })
    }
    catch (e) {
      this.log && this.log.info(e, 'GoDaddy Error')
      return false
    }
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

  private buildGoDaddyDomainURL = (domain: string): string => {
    return `${goDaddyAPIRoot}/domains/${domain}`
  }
}
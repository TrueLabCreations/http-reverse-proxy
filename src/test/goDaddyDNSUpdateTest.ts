import { GoDaddyDNSUpdate } from '../lib/dns/goDaddyDNSUpdate'
import { SimpleLogger } from '../examples/simpleLogger'

const secret = "Jqxr3DyfBVtGbRWB73qScP"
const key = "2uMXHUQiS1_CqTB43kWthyvoUCExRyQqD"

export class GoDaddyDNSUpdateTests extends GoDaddyDNSUpdate {
  constructor() {
    super({APIKey:key, secret: secret})
    this.log = new SimpleLogger()
  }

  public testRetrieve = async () => {
    const records = await this.getRecordsOfType('swiedler.com', 'TXT')
    this.log.info(records, 'Retrival results')
    if (Array.isArray(records)) {
      const acmeChallenge = records.findIndex((record) => record.name === '_acme-challenge')

      if (acmeChallenge >= 0) {
        records.splice(acmeChallenge, 1)
      }
      else {
        records.push({ name: '_acme-challenge', type: 'TXT', data: 'abcde', ttl: 600 })
      }
      // records.forEach((record)=>{delete record.type})
      const result = await this.updateRecordsOfType('swiedler.com', 'TXT', records)
      this.log.info(result, 'Update results')
    }
    else {
      this.log.error(records, 'Error getting DNS records')
    }
  }
}
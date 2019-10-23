import http from 'http'
import LetsEncrypt, { LetsEncryptClientOptions } from '../src/letsEnryptUsingAcmeClient'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'

chai.use(chaiAsPromised)

export class LetsEncryptTests extends LetsEncrypt {
  private domain: string
  private email: string

  constructor(options: LetsEncryptClientOptions, domain: string, email: string) {
    super(options)
    this.domain = domain
    this.email = email
  }

  oneMonth = 30 * 24 * 60 * 60 * 1000

  public runLetsEncryptCheckServerTest = () => {
    describe('LetsEncrypt server should respond with error', () => {

      const promise = new Promise((resolve, reject) => {
        http.get('http://localhost:80', (res: http.IncomingMessage) => {
          resolve(res.statusCode)
        })
      })

      it('should return status code 404', (done) => {
        expect(promise).to.eventually.be.equal(404)
        done()
      })
    })
  }

  public runLetsEncryptGetCertificateTest = (forceRenew: boolean = false) => {
    describe('LetsEncrypt get certificate test', () => {
      it('should get a vaild certificate', (done) => {
        expect (
        this.getLetsEncryptCertificate(this.domain, false, this.email, this.oneMonth, forceRenew)
        ).to.eventually.be.true.notify(done)
        //   (result) => {
        //     expect(result).to.be.true.notify(done)
        //   },
        //   (err) => {
        //     done(err);
        //   }
        // )
      })
    }).afterAll(() => {
      this.close()
    })
  }
}
import http from 'http'
import LetsEncrypt, { LetsEncryptServerOptions } from '../letsEnryptUsingAcmeClient'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import 'mocha'

chai.use(chaiAsPromised)

export class LetsEncryptTests extends LetsEncrypt {
  private domain: string
  private email: string

  constructor(options: LetsEncryptServerOptions, domain: string, email: string) {
    super(options)
    this.domain = domain
    this.email = email
  }

  public runLetsEncryptCheckServerTest = () => {
    describe('LetsEncrypt server should respond with error', () => {
      const promise = new Promise((resolve, reject) => {
        http.get('http://localhost:80', (res: http.IncomingMessage) => {
          resolve(res.statusCode)
        })
      })
      it('should resolve to 404', (done) => {
        expect(promise).to.eventually.be.equal(404)
        done()
      })
    })
  }

  public runLetsEncryptGetCertificateTest = () => {
    describe('LetsEncrypt get certificate test', () => {
      it('should get a vaild certificate', (done) => {
        this.getNewCertificate(this.domain, false, this.email).then(
          function (result) {
            expect(result).to.be.true
            done();
          },
          function (err) {
            done(err);
          }
        )
      })
    })
  }
}
import forge from 'node-forge'
import BaseLetsEncryptClient, { BaseLetsEncryptOptions } from './letsEncrypt'

export interface LetsEncryptSelfSignedOptions extends BaseLetsEncryptOptions {
  country: string
  state: string
  locality: string
  organizationName: string
}

const threeMonths = 90 * 24 * 60 * 60 * 1000

export default class LetsEncryptUsingSelfSigned extends BaseLetsEncryptClient {
  private country: string
  private state: string
  private locality: string
  private organizationName: string

  constructor(options: LetsEncryptSelfSignedOptions) {
    super(options)
    this.country = options.country
    this.state = options.state
    this.locality = options.locality
    this.organizationName = options.organizationName
  }

  protected getNewCertificate = async (
    host: string,
    production: boolean,
    email: string): Promise<boolean> => {

    /**
     * this was taken straight from the forge example
     */

    const keys = forge.pki.rsa.generateKeyPair(1024)
    const certificate = forge.pki.createCertificate()
    certificate.publicKey = keys.publicKey
    certificate.serialNumber = '01'
    certificate.validity.notBefore = new Date()
    certificate.validity.notAfter = new Date(new Date().valueOf() + threeMonths)
    const attrs = [{
      name: 'commonName',
      value: host
    }, {
      name: 'countryName',
      value: this.country
    }, {
      shortName: 'ST',
      value: this.state
    }, {
      name: 'localityName',
      value: this.locality
    }, {
      name: 'organizationName',
      value: this.organizationName
    }, {
      shortName: 'OU',
      value: this.organizationName
    }];
    certificate.setSubject(attrs);
    certificate.setIssuer(attrs);
    certificate.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    }, {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 6, // URI
        value: `http://${host}`
      }, {
        type: 7, // IP
        ip: '127.0.0.1'
      }]
    }, {
      name: 'subjectKeyIdentifier'
    }]);

    // self-sign certificate
    certificate.sign(keys.privateKey)

    // PEM-format keys and cert
    const pem = {
      privateKey: forge.pki.privateKeyToPem(keys.privateKey),
      publicKey: forge.pki.publicKeyToPem(keys.publicKey),
      certificate: forge.pki.certificateToPem(certificate)
    }

    this.stats && this.stats.updateCount('SelfSignedCertificatesRequested', 1)
    this.log && this.log.info(pem, 'Certificate created.')

    this.certificates.saveCertificateToStore(host, pem.privateKey, pem.certificate )
    this.certificates.propogateNewCredential(host, pem.privateKey, pem.certificate )

    return true
  }

}
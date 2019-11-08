import tls from 'tls'
import {Certificates} from '../lib/certificates'
import chai, { expect } from 'chai'
import 'mocha'

export class CertificateTests extends Certificates {
  constructor(certificateStoreRoot: string) {
    super({certificateStoreRoot: certificateStoreRoot})
  }
  emptyContext: tls.SecureContext = {
    context: {
    }
  }

  testKey =
    `-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQC3/RrjekqUKjL+pfEQiA8prbSl+KeN07Hb8N5jNDyEYla9YL8u
SfJYI6DQQrJmNZBsg0SDr3yaoXD+M7LUazkivsXl2yzt0SurLj5V2uHoe2MXTFBf
z7rv17CUKnNMwlqWhL9Bn4UDKQ7ZTStScbGgXhlm8FnAEdT55VU5Sz3fpwIDAQAB
AoGAXoUEv0Af+CYFtJSDVz7Oq1a1q14mldHfWWJQnR5EyK3MadW94YXTnjwPbW4W
QDPcUiLNm+kXVkkBx1W/1SiQXM2cYHdzeaQ4998kV/n2bh2687lzyPZ/yc4jLSQi
ppcQ5Gm0ylTk6dZwkYZSo+rJOO7U110BXHDYZPcw9ti0kgECQQDpMOVgV9yodk4/
EN6cGcae+gRt9LSDxrQlQAbAyf9kmzTfVyX5gj7fcDIH225+ceaZJDZ/dooRL9tc
3FV/UFzBAkEAyfwu1UFlSceccHAr+11Yi5czn0Bea+oC9Ybh2Vhwe2fh6lEs0eel
g0xKdCY8Ws1WngN3qHMXcw76lg2KhFYOZwJBANNUZbvPRIFDXhwXbLbpQTCYAmWn
y+RUsrPDd5tGNPb3FY6GSzr4x4P1CNJIEbX0AXit8dnIEs4KofFhGPadXMECQCXB
8ZNF3URUfyb5oQ8lHPdDNZAwfTYZEaKKK0/w214GRlICCKnYbrVDnqtltmSW+/kf
1s9zbE/C3g8MyvcAC0MCQCqMx7xNRGIq/mJBZUO9Olxd81WpPZajVFUDV2oXLj0W
8FkMcQm7zBB8UR7+PzupiSwMOYMPsMGkD9F9wQEqoK8=
-----END RSA PRIVATE KEY-----`

  testCertificate =
    `-----BEGIN CERTIFICATE-----
MIICjDCCAfUCFEI9OKbi66gvcWVhjIn+48kpGrd1MA0GCSqGSIb3DQEBCwUAMIGE
MQswCQYDVQQGEwJVUzEQMA4GA1UECAwHR2VvcmdpYTEQMA4GA1UEBwwHUm9zd2Vs
bDERMA8GA1UECgwIU3dpZWRsZXIxHTAbBgNVBAMMFHRlc3Rpbmcuc3dpZWRsZXIu
Y29tMR8wHQYJKoZIhvcNAQkBFhB0b21Ac3dpZWRsZXIuY29tMB4XDTE5MTAxNzEx
MDMwN1oXDTE5MTExNjExMDMwN1owgYQxCzAJBgNVBAYTAlVTMRAwDgYDVQQIDAdH
ZW9yZ2lhMRAwDgYDVQQHDAdSb3N3ZWxsMREwDwYDVQQKDAhTd2llZGxlcjEdMBsG
A1UEAwwUdGVzdGluZy5zd2llZGxlci5jb20xHzAdBgkqhkiG9w0BCQEWEHRvbUBz
d2llZGxlci5jb20wgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBALf9GuN6SpQq
Mv6l8RCIDymttKX4p43Tsdvw3mM0PIRiVr1gvy5J8lgjoNBCsmY1kGyDRIOvfJqh
cP4zstRrOSK+xeXbLO3RK6suPlXa4eh7YxdMUF/Puu/XsJQqc0zCWpaEv0GfhQMp
DtlNK1JxsaBeGWbwWcAR1PnlVTlLPd+nAgMBAAEwDQYJKoZIhvcNAQELBQADgYEA
rT0K8pIVQQjggc9z5KgZvgzZAuj/dKmdMDlWCG64IgktxcQ27SPaW/GtvTaWS4wY
1rnhxHeqts9SS2CnTKCEBvKh+f1RqN7kphZ+SLImzrQtWpkSnCjAjUgBsIaRiKuu
KjcBsrilsxwsGqzrovvVbucVOtEZnx2t7ipI9EfSvuU=
-----END CERTIFICATE-----`

  public TestAddingHosts = () => {
    describe('Test adding an empty context', () => {

      it('should add the empty context', () => {

        expect(this.addCertificate('test.host.com', this.emptyContext)).to.be.true
      })

      it('should not add the same host again', () => {

        expect(this.addCertificate('test.host.com', this.emptyContext)).to.be.false
      })

      it('should update the same host', () => {

        expect(this.updateCertificate('test.host.com', this.emptyContext)).to.be.true
      })

      it('should not retrieve an unknown host', () => {

        expect(this.getCertificate('test1.host.com')).to.be.undefined
      })

      it('should retrieve the empty context', () => {

        expect(this.getCertificate('test.host.com')).to.be.an('object')
      })

      it('should remove the test certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.true
      })

      it('should not remove a non existant certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.false
      })

      it('should have an empty certificate table', () => {

        expect(Object.keys(this.certificates)).to.have.length(0)
      })
    })

    describe('test adding certificates', () => {

      it('should add a valid certificate', () => {

        expect(this.loadCertificate('test.host.com', this.testKey, this.testCertificate)).to.be.true
      })

      it('should remove the certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.true
      })

      it('should add a valid certificate and extract additional data', () => {

        expect(this.loadCertificate('test.host.com', this.testKey, this.testCertificate, null, true)).to.be.true
      })

      it('should get the addtional data', () => {

        const additionalInfo = this.getCertificateInformation('test.host.com')
        
        expect(additionalInfo).to.be.an('object')
        expect(additionalInfo).to.have.property('expiresOn')
        expect(additionalInfo.expiresOn).to.be.a('Date')
        expect(additionalInfo.expiresOn.toLocaleDateString()).to.be.equal('11/16/2019')
        expect(additionalInfo.commonName).to.be.equal('testing.swiedler.com')
      })

      it('should remove the certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.true
      })
    })

    describe('test loading certificates from files', () => {

      it('should load a certificate from files', () => {

        expect(this.loadCertificateFromFiles('test.host.com', '../certificates/testing_swiedler_com_key.pem',
          '../certificates/testing_swiedler_com_crt.pem')).to.be.true
      })

      it('should remove the certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.true
      })

      it('should load a certificate from files with additional data', () => {

        expect(this.loadCertificateFromFiles('test.host.com', '../certificates/testing_swiedler_com_key.pem',
          '../certificates/testing_swiedler_com_crt.pem', null, true)).to.be.true
      })

      it('should get the addtional data', () => {

        const additionalInfo = this.getCertificateInformation('test.host.com')
        
        expect(additionalInfo).to.be.an('object')
        expect(additionalInfo).to.have.property('expiresOn')
        expect(additionalInfo.expiresOn).to.be.a('Date')
        expect(additionalInfo.expiresOn.toLocaleDateString()).to.be.equal('11/16/2019')
        expect(additionalInfo.commonName).to.be.equal('testing.swiedler.com')
      })

      it('should remove the certificate', () => {

        expect(this.removeCertificate('test.host.com')).to.be.true
      })
    })

    describe('test loading certificates from store', () => {

      it('should load a certificate from store', () => {

        expect(this.loadCertificateFromStore('testing.swiedler.com')).to.be.true
      })

      it('should remove the certificate', () => {

        expect(this.removeCertificate('testing.swiedler.com')).to.be.true
      })

      it('should load a certificate from store with additional data', () => {

        expect(this.loadCertificateFromStore('testing.swiedler.com', true)).to.be.true
      })

      it('should get the addtional data', () => {

        const additionalInfo = this.getCertificateInformation('testing.swiedler.com')
        
        expect(additionalInfo).to.be.an('object')
        expect(additionalInfo).to.have.property('commonName')
        expect(additionalInfo.commonName).to.be.a('string')
        expect(additionalInfo.commonName).to.be.equal('testing.swiedler.com')
      })

      it('should remove the certificate', () => {
        expect(this.removeCertificate('testing.swiedler.com')).to.be.true
      })
    })

    describe('Test multiple certificates',() =>{

      it('should load 100 certificates',()=>{
      
        const testInformation = {
          expiresOn: new Date(),
          commonName: ''
        }

        for (let i = 0; i< 100; ++i){

          expect(this.addCertificate(`test${i}.host.com`, Object.assign({}, this.emptyContext))).to.be.true
          
          const certificate = this.certificates[`test${i}.host.com`]
          
          expect(certificate).to.be.an('object')
          
          certificate.certificateInformation=Object.assign({}, testInformation)
          certificate.certificateInformation.commonName = `test${i}.host.com`
          
          expect(this.getCertificateInformation(`test${i}.host.com`)).to.be.an('object')
        }
      })

      it('should have 100 certificates', () =>{

        expect(Object.keys(this.getActiveCertificates())).to.have.lengthOf(100)
      })

      it('should have the proper common names', ()=>{

        for (let i = 0; i< 100; ++i){

          expect(this.getCertificateInformation(`test${i}.host.com`)).to.be.an('object')
          expect(this.getCertificateInformation(`test${i}.host.com`).commonName).to.be.a('string')
          expect(this.getCertificateInformation(`test${i}.host.com`).commonName).to.be.equal(`test${i}.host.com`)
        }
      })

      it('should clear all certificates', ()=>{

        for (let i = 0; i< 100; ++i){

          expect(this.getCertificateInformation(`test${i}.host.com`)).to.be.an('object')
          expect(this.removeCertificate(`test${i}.host.com`)).to.be.true
        }
      })

      it('should have no certificates',()=>{

        expect(Object.keys(this.getActiveCertificates())).to.have.lengthOf(0)
      })
    })
  }
}

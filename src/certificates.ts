import tls from "tls";
import fs from "fs";
import path from 'path'
import forge from 'node-forge'

export interface CertificateInformation {
  expiresOn: Date
  commonName: string
}

interface CertificateData {
  secureContext: tls.SecureContext
  certificateInformation?: CertificateInformation
}

interface ActiveCertificates {
  [host: string]: CertificateData
}

export default class Certificates {
  private certificateStoreRoot: string;

  constructor(certificateStoreRoot: string) {
    this.certificateStoreRoot = certificateStoreRoot
  }

  protected certificates: ActiveCertificates = {}

  public getActiveCertificates = (): ActiveCertificates => {
    return this.certificates
  }

  public getCertificate = (hostName: string): tls.SecureContext => {
    return this.certificates[hostName] && this.certificates[hostName].secureContext
  }

  public getCertificateInformation = (hostName: string): CertificateInformation => {
    return this.certificates[hostName] && this.certificates[hostName].certificateInformation
  }

  public addCertificate = (hostName: string, secureContext: tls.SecureContext): boolean => {
    if (!this.certificates[hostName]) {
      this.certificates[hostName] = { secureContext }
      return true
    }
    return false
  }

  public updateCertificate = (hostName: string, secureContext: tls.SecureContext): boolean => {
    if (this.certificates[hostName]) {
      this.certificates[hostName] = { secureContext }
      return true
    }
    return false
  }

  public removeCertificate = (hostName: string): boolean => {
    if (!this.certificates[hostName]) {
      return false
    }
    delete this.certificates[hostName]
    return true
  }

  public loadCertificate = (
    hostName: string,
    key: string | string[],
    certificate: string | string[],
    ca?: string | string[],
    loadCertificateData?: boolean): boolean => {

    if (this.certificates[hostName] || !key || !certificate) {
      return false
    }

    const details: tls.SecureContextOptions = {
      key: key,
      cert: certificate,
    };

    if (ca)
      details.ca = ca

    const context = tls.createSecureContext(details).context

    if (loadCertificateData) {
      const cert = forge.pki.certificateFromPem(Array.isArray(certificate) ? certificate[0] : certificate)
      this.certificates[hostName] = {
        secureContext: context,
        certificateInformation: {
          expiresOn: cert.validity.notAfter,
          commonName: cert.subject.attributes.reduce((current, attribute) => attribute.name === 'commonName' ? attribute.value : current, null)
        }
      }
    }
    else {
      this.certificates[hostName] = { secureContext: context }
    }
    return true
  }

  public loadCertificateFromFiles = (
    hostName: string,
    keyFilePath: string,
    certificateFilePath: string | string[],
    caFilePath?: string | string[],
    loadCertificateData?: boolean): boolean => {

    const key = this.getCertificateData(keyFilePath, false)
    const certificate = this.getCertificateData(certificateFilePath, false)
    const ca = caFilePath && this.getCertificateData(caFilePath, true)

    return this.loadCertificate(hostName, key, certificate, ca, loadCertificateData)
  }

  public loadCertificateFromStore = (hostName: string, loadCertificateData?: boolean): boolean => {

    const pathName = hostName.replace(/\./g, '_')
    const storePath = path.join(`${this.certificateStoreRoot}`,`${pathName}`)

    const key = this.getCertificateData(path.join(`${storePath}`,`${pathName}-key.pem`), false)
    const certificate = this.getCertificateData(path.join(`${storePath}`,`${pathName}-crt.pem`), false)
    const ca = this.getCertificateData(path.join(`${storePath}`,`${pathName}-ca.pem`), true)

    return this.loadCertificate(hostName, key, certificate, ca, loadCertificateData)
  }

  public saveCertificateToStore = (hostName: string, key: string, certificate: string, ca?: string) => {
    // this.log && this.log.info(null, `Saving key and certificate at path: ${certificateStoreRoot}`);
    const pathName = hostName.replace(/\./g, '_')

    const storePath = path.join(`${this.certificateStoreRoot}`,`${pathName}`)

    return this.mkDir(storePath, { recursive: true }) &&
      this.writeFile(path.join(`${storePath}`,`${pathName}-key.pem`), key) &&
      this.writeFile(path.join(`${storePath}`,`${pathName}-crt.pem`), certificate) &&
      (!ca || this.writeFile(path.join(`${storePath}`,`${pathName}-ca.pem`), ca))
  }

  public getCertificateData = (pathName: string | string[], unbundle: boolean): string | string[] => {

    if (pathName) {
      if (Array.isArray(pathName)) {
        const pathnames: string[] = pathName;
        return pathnames.map((pathname) => {
          return this.getCertificateData(pathname, unbundle)
        }).flat();
      } else if (this.exists(pathName)) {
        if (unbundle) {
          const bundle = this.readFile(pathName, 'utf8')
          if (bundle)
            return this.unbundleCertificate(bundle);
          else return null
        } else {
          return this.readFile(pathName, 'utf8');
        }
      }
    }
  }

  private unbundleCertificate = (bundle: string): string[] => {
    const lines: string[] = bundle ? bundle.trim().split('\n') : []

    const ca = [];
    let cert = [];

    for (let line of lines) {
      line = line.trim();
      if (!(line.length !== 0)) {
        continue;
      }
      cert.push(line);
      if (line.match(/-END CERTIFICATE-/)) {
        ca.push(cert.join('\n'));
        cert = [];
      }
    }
    return ca;
  }

  private exists = (path: string): boolean => {
    return fs.existsSync(path)
  }

  private mkDir = (path: string, opts = { recursive: true }): boolean => {
    try {
      fs.mkdirSync(path, opts)
      return true
    }
    catch (e) {
      return false
    }
  }

  private writeFile = (path: string, data: any, opts = 'utf8'): boolean => {
    try {
      fs.writeFileSync(path, data, opts)
    }
    catch (e) {
      return false
    }
    return true
  }

  private readFile = (path: string, encoding: string = 'utf8'): string => {
    try {
      return fs.readFileSync(path, { encoding: encoding, flag: 'r' }).toString()
    }
    catch (e) {
      return null
    }
  }
}
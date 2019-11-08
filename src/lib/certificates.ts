import tls from "tls"
import cluster from 'cluster'
import fs from "fs"
import path from 'path'
import forge from 'node-forge'
import { SimpleLogger } from "../examples/simpleLogger";
import { Statistics } from "./statistics";
import { ClusterMessage } from "./httpReverseProxy";

export interface CertificateOptions {
  certificateStoreRoot: string
  log?: SimpleLogger
  stats?: Statistics
}

export interface CertificateInformation {

  expiresOn: Date
  commonName: string
}

export interface CertificateMessage extends ClusterMessage {

  hostname: string
  key: string
  certificate: string
  ca?: string
}

interface CertificateData {

  secureContext: tls.SecureContext
  certificateInformation?: CertificateInformation
}

interface ActiveCertificates {

  [host: string]: CertificateData
}

export class Certificates {

  private certificateStoreRoot: string;
  protected certificates: ActiveCertificates = {}
  protected log: SimpleLogger
  protected stats: Statistics

  constructor(options: CertificateOptions) {

    this.certificateStoreRoot = options.certificateStoreRoot
    this.log = options.log
    this.stats = options.stats
  }

  public getActiveCertificates = (): ActiveCertificates => {

    return this.certificates
  }

  public getCertificate = (hostname: string): tls.SecureContext => {

    this.stats && this.stats.updateCount('CertificatesRequested', 1)

    return this.certificates[hostname] && this.certificates[hostname].secureContext
  }

  public getCertificateInformation = (hostname: string): CertificateInformation => {

    return this.certificates[hostname] && this.certificates[hostname].certificateInformation
  }

  public addCertificate = (hostname: string, secureContext: tls.SecureContext): boolean => {

    if (!this.certificates[hostname]) {

      this.stats && this.stats.updateCount('CertificatesAdded', 1)

      this.certificates[hostname] = { secureContext }
      return true
    }

    return false
  }

  public updateCertificate = (hostname: string, secureContext: tls.SecureContext): boolean => {

    if (this.certificates[hostname]) {

    this.stats && this.stats.updateCount('CertificatesUpdated', 1)

    this.certificates[hostname] = { secureContext }
      return true
    }

    return false
  }

  public removeCertificate = (hostname: string): boolean => {

    if (!this.certificates[hostname]) {

      return false
    }

    this.stats && this.stats.updateCount('CertificatesRemoved', 1)

    delete this.certificates[hostname]
    return true
  }

  public loadCertificate = (
    hostname: string,
    key: string | string[],
    certificate: string | string[],
    ca?: string | string[],
    loadCertificateData?: boolean): boolean => {

    if (this.certificates[hostname] || !key || !certificate) {

      return false
    }

    const details: tls.SecureContextOptions = {
      key: key,
      cert: certificate,
    };

    if (ca) {

      details.ca = ca
    }

    const context = tls.createSecureContext(details).context

    if (loadCertificateData) {

      const cert = forge.pki.certificateFromPem(Array.isArray(certificate) ? certificate[0] : certificate)

      this.stats && this.stats.updateCount('CertificatesLoaded', 1)
  
      this.certificates[hostname] = {
        secureContext: context,
        certificateInformation: {
          expiresOn: cert.validity.notAfter,
          commonName: cert.subject.attributes.reduce((current, attribute) => attribute.name === 'commonName' ? attribute.value : current, null)
        }
      }
    }
    else {

      this.stats && this.stats.updateCount('CertificatesLoaded', 1)

      this.certificates[hostname] = { secureContext: context }
    }

    return true
  }

  public loadCertificateFromFiles = (
    hostname: string,
    keyFilename: string,
    certificateFileName: string | string[],
    caFilename?: string | string[],
    loadCertificateData?: boolean): boolean => {

    const key = this.getCertificateData(keyFilename, false)
    const certificate = this.getCertificateData(certificateFileName, false)
    const ca = caFilename && this.getCertificateData(caFilename, true)

    return this.loadCertificate(hostname, key, certificate, ca, loadCertificateData)
  }

  public loadCertificateFromStore = (hostname: string, loadCertificateData?: boolean): boolean => {

    const pathName = hostname.replace(/\./g, '_')
    const storePath = path.join(`${this.certificateStoreRoot}`, `${pathName}`)

    const key = this.getCertificateData(path.join(`${storePath}`, `${pathName}-key.pem`), false)
    const certificate = this.getCertificateData(path.join(`${storePath}`, `${pathName}-crt.pem`), false)
    const ca = this.getCertificateData(path.join(`${storePath}`, `${pathName}-ca.pem`), true)

    return this.loadCertificate(hostname, key, certificate, ca, loadCertificateData)
  }

  public saveCertificateToStore = (hostname: string, key: string, certificate: string, ca?: string) => {

    const pathName = hostname.replace(/\./g, '_')

    const storePath = path.join(`${this.certificateStoreRoot}`, `${pathName}`)

    this.stats && this.stats.updateCount('CertificatesSavedToStore', 1)

    return this.mkDir(storePath, { recursive: true }) &&
      this.writeFile(path.join(`${storePath}`, `${pathName}-key.pem`), key) &&
      this.writeFile(path.join(`${storePath}`, `${pathName}-crt.pem`), certificate) &&
      (!ca || this.writeFile(path.join(`${storePath}`, `${pathName}-ca.pem`), ca))
  }

  public propogateNewCredential = (hostname: string, key: string, certificate: string, ca?: string) => {

    if (cluster.isWorker) {

      this.stats && this.stats.updateCount('CertificatesMessagesSent', 1)

      cluster.worker.send({

        messageType: 'certificate',
        action: 'addCertificate',
        hostname: hostname,
        key: key,
        certificate: certificate,
        ca: ca
      } as CertificateMessage)
    }
    else {

      delete this.certificates[hostname]
      this.loadCertificate(hostname, key, certificate, ca)
    }
  }

  public processMessage = (message: CertificateMessage) => {

    this.stats && this.stats.updateCount('CertificatesMessagesReceived', 1)
    
    switch (message.action) {

      case 'addCertificate':

        delete this.certificates[message.hostname]
        this.loadCertificate(message.hostname, message.key, message.certificate, message.ca)

        break

      default:

      break
    }
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

          if (bundle) {

            return this.unbundleCertificate(bundle);
          }

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

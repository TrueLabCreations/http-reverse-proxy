import tls from "tls"
import cluster from 'cluster'
import fs from "fs"
import path from 'path'
import forge from 'node-forge'
import { SimpleLogger } from "../examples/simpleLogger";
import { Statistics } from "./statistics";
import { ClusterMessage } from "./httpReverseProxy";

/**
 * Options for the certificate manager.
 * 
 * certificateStoreRoot: The absolute or relative path to the 
 * base directory for the certificates in the file system.
 * 
 * This directory must have read, write, delete privedges
 */

export interface CertificateOptions {
  certificateStoreRoot: string
  log?: SimpleLogger
  stats?: Statistics
}

/**
 * Additional information about the certificate to allow management of expirations
 */

export interface CertificateInformation {

  expiresOn: Date
  commonName: string
}

/**
 * The message format for messaging through the 
 * master to other workers in a cluster
 */

export interface CertificateMessage extends ClusterMessage {

  hostname: string
  key: string
  certificate: string
  ca?: string
}

/**
 * The certificate and addiional data stored in the certificate table
 */

interface CertificateData {

  secureContext: tls.SecureContext
  certificateInformation?: CertificateInformation
}

/**
 * the Certificate table. Properties are the hostname, 
 * value is the certificate and additional information
 */

interface ActiveCertificates {

  [hostname: string]: CertificateData
}

/**
 * The class implementing the certificate store
 */

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

  /**
   * Return all of the active certificates
   */

  public getActiveCertificates = (): ActiveCertificates => {

    return this.certificates
  }

  /**
   * Get the certificate for a given hostname
   */

  public getCertificate = (hostname: string): tls.SecureContext => {

    this.stats && this.stats.updateCount('CertificatesRequested', 1)

    return this.certificates[hostname] && this.certificates[hostname].secureContext
  }

  /**
   * Get the additional certificate information for a given hostname
   */

  public getCertificateInformation = (hostname: string): CertificateInformation => {

    return this.certificates[hostname] && this.certificates[hostname].certificateInformation
  }

  /**
   * Add a certificate to the table if one does not exist
   */

  public addCertificate = (hostname: string, secureContext: tls.SecureContext): boolean => {

    if (!this.certificates[hostname]) {

      this.stats && this.stats.updateCount('CertificatesAdded', 1)

      this.certificates[hostname] = { secureContext }
      return true
    }

    return false
  }

  /**
   * Update a certificate in the table if it exists
   */

  public updateCertificate = (hostname: string, secureContext: tls.SecureContext): boolean => {

    if (this.certificates[hostname]) {

      this.stats && this.stats.updateCount('CertificatesUpdated', 1)

      this.certificates[hostname] = { secureContext }
      return true
    }

    return false
  }

  /**
   * Remove a certificate from the table
   */

  public removeCertificate = (hostname: string): boolean => {

    if (!this.certificates[hostname]) {

      return false
    }

    this.stats && this.stats.updateCount('CertificatesRemoved', 1)

    delete this.certificates[hostname]
    return true
  }

  /**
   * Load a certificate from a key, cert, and ca strings. This is the format of
   * the certificates on the filesystem and generated from the LetsEncrypt system
   */

  public loadCertificate = (
    hostname: string,
    key: string | string[],
    certificate: string | string[],
    ca?: string | string[]): boolean => {

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

    /**
     * Create the secure context used by the https SNI interface.
     */

    const context = tls.createSecureContext(details).context

    /**
     * use forge to extract the data from the PEM string
     */

    const cert = forge.pki.certificateFromPem(Array.isArray(certificate) ? certificate[0] : certificate)

    this.stats && this.stats.updateCount('CertificatesLoaded', 1)

    this.certificates[hostname] = {

      secureContext: context,

      certificateInformation: {
        expiresOn: cert.validity.notAfter,
        commonName: cert.subject.attributes.reduce((current, attribute) => attribute.name === 'commonName' ? attribute.value : current, null)
      }
    }

    return true
  }

  /**
   * Load a certificate from a set of PEM encoded files (key, certificate, ca?)
   * 
   * Files are absolute locations, not from the certificateStoreRoot
   */

  public loadCertificateFromFiles = (
    hostname: string,
    keyFilename: string,
    certificateFileName: string | string[],
    caFilename?: string | string[]): boolean => {

    const key = this.getCertificateData(keyFilename, false)
    const certificate = this.getCertificateData(certificateFileName, false)
    const ca = caFilename && this.getCertificateData(caFilename, true)

    return this.loadCertificate(hostname, key, certificate, ca)
  }

  /**
   * Load a certificate relative to the certificateStoreRoot based on the hostname
   */

  public loadCertificateFromStore = (hostname: string/*, loadCertificateData?: boolean*/): boolean => {

    const pathName = hostname.replace(/\./g, '_').replace(/\*/g, '')
    const storePath = path.join(`${this.certificateStoreRoot}`, `${pathName}`)

    const key = this.getCertificateData(path.join(`${storePath}`, `${pathName}-key.pem`), false)
    const certificate = this.getCertificateData(path.join(`${storePath}`, `${pathName}-crt.pem`), false)
    const ca = this.getCertificateData(path.join(`${storePath}`, `${pathName}-ca.pem`), true)

    return this.loadCertificate(hostname, key, certificate, ca)//, loadCertificateData)
  }

  /**
   * Save a certificate relative to the certificateStoreRoot based on the hostname
   */

  public saveCertificateToStore = (hostname: string, key: string, certificate: string, ca?: string) => {

    delete this.certificates[hostname]

    this.loadCertificate(hostname, key, certificate, ca)

    const pathName = hostname.replace(/\./g, '_')

    const storePath = path.join(`${this.certificateStoreRoot}`, `${pathName}`)

    this.stats && this.stats.updateCount('CertificatesSavedToStore', 1)

    return this.mkDir(storePath, { recursive: true }) &&
      this.writeFile(path.join(`${storePath}`, `${pathName}-key.pem`), key) &&
      this.writeFile(path.join(`${storePath}`, `${pathName}-crt.pem`), certificate) &&
      (!ca || this.writeFile(path.join(`${storePath}`, `${pathName}-ca.pem`), ca))
  }

  /**
   * In a cluster environment propagate the certificate 
   * to the other worker processes via the master process
   */

  public propagateNewCertificate = (hostname: string, key: string, certificate: string, ca?: string) => {

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

      /**
       * We only need to load the certificate into the table.
       * The process that created the certificate should have saved it to a file
       */

      this.loadCertificate(hostname, key, certificate, ca)
    }
  }

  /**
   * In a cluster environment the master will call this method to propagate the certificate
   */

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

  /**
   * Read a (set) of PEM file(s) and flatten and unbundle them if they are a bundle
   */

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

  /**
   * Unbundle a PEM string
   */

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

  /**
   * File system helper functions
   * 
   * All operations are sync due to time constraints at startup
   */

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

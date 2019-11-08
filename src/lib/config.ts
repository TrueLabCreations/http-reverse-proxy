'use strict'

// Load environment variables from the `.env` file.
import dotenv, { DotenvConfigOptions } from 'dotenv'

const dotEnvOptions: DotenvConfigOptions = {
  path: `../.env.${process.env.NODE_ENV || 'production'}`,
}

dotenv.config(dotEnvOptions)

export interface SiteConfiguration {
  host: string
  proxyTo: string
  keyFilename: string
  certFilename: string
  serverCommandLine?: string
  args?:string[],
  serverName?: string
}

export interface Config {
  httpPort: string
  httpsPort: string
  certificatePath: string
  sites: SiteConfiguration[]
}

export const config: Config = {

  // Server port.
  httpPort: process.env.HTTP_PORT,
  httpsPort: process.env.HTTPS_PORT,
  certificatePath: `${process.env.ROOT_DIRECTORY}/${process.env.CERTIFICATE_PATH}`,
  sites: [
    {
      host: "fussyruff.swiedler.com",
      proxyTo: "http://localhost:8001",
      keyFilename: `fussyruff-key.pem`,
      certFilename: `fussyruff-cert.pem`,
      serverCommandLine: 'node',
      args: ['.\\server1'],
      serverName: 'fussyruff'
    },
    {
      host: "roswellchocolate.swiedler.com",
      proxyTo: "http://localhost:8002",
      keyFilename: `roswellchocolate-key.pem`,
      certFilename: `roswellchocolate-cert.pem`,
      serverCommandLine: 'node',
      args: ['.\\server2'],
      serverName: 'roswellchocolate'
    }
  ]
}


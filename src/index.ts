import config from './config'
import { spawn } from 'child_process'

import HTTPReverseProxy, { HTTPReverseProxyOptions } from './httpReverseProxy'

const testOptions:HTTPReverseProxyOptions={
  port: 8080,
  maintainCertificates: false,
  proxyOptions: {
    xfwd: false,
    secure: false,
    ntlm: false,
  },
  httpsOptions: {
    port: 8443,
    // keyPath: 'C:\\dev\\http-reverse-proxy\\certificates\\test-key.pem',
    certificatePath: 'C:\\dev\\http-reverse-proxy\\certificates',
    // secure: false
  },
  preferForwardedHost: false,
  // serverModule: null,
}

const proxy = new HTTPReverseProxy(testOptions)

proxy.forward('testing.swiedler.com', 'localhost:8001',{
  httpsOptions:{
    redirect:true, 
    keyPath:'../certificates/testing_swiedler_com_key.pem',
    certificatePath:'../certificates/testing_swiedler_com_crt.pem'
  }
})

// proxy.register('testing.swiedler.com:8443', 'localhost:8001',{
//   ssl:{
//     redirect:true, 
//     keyPath:'../certificates/testing_swiedler_com_key.pem',
//     certificatePath:'../certificates/testing_swiedler_com_crt.pem'
//   }
// })
// const c = { ...config }

// const proxy = redbird({
//    port: config.httpPort, 
//    letsencrypt:{
//      path: config.certificatePath
//    },
//    ssl: { 
//      port: config.httpsPort 
//     } 
//   })

// const startServer = (serverName: string, commandLine: string, args: string[]) => {
//   const name = serverName || commandLine.split(' ')[0]
//   const server = spawn(commandLine, args)

//   server.stderr.on('data', data => {
//     console.error(`Server ${name} error: ${data}`)
//   })

//   server.stdout.on('data', data => {
//     console.log(`Server ${name}: ${data}`)
//   })

//   server.stdout.on('close', code => {
//     console.error(`Server ${name} closed wth code ${code}`)
//   })
// }

// for (const site of config.sites) {
//   proxy.register(site.host, site.proxyTo,
//     {
//       ssl: {
//         letsencrypt: {
//           email: "tom@swiedler.com",
//           production: false,
//           path: config.certificatePath
//         }
//       }
//     },
//     //, {
//     //   ssl: {
//     //     key: `${config.certificatePath}/${site.keyFilename}`,
//     //     cert: `${config.certificatePath}/${site.certFilename}`
//     //   }
//     // }
//   )
//   if (site.serverCommandLine) {
//     startServer(site.serverName, site.serverCommandLine, site.args)
//   }
// }

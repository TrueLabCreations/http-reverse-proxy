# HTTP/HTTPS Reverse Proxy

This package implements an http/https reverse proxy. It allows multiple web services/sites to share a single internet interface (router) and share ports 80 and 443 (or any other ports you use). The goal is to provide a secure, easy to implement, proxy for privately hosted servers.

## Installation

If you already have nodejs and npm installed then the package can be installed from npm via

```
npm install --save http-reverse-proxy-ts
```

## Running a simple http reverse proxy server

For this simple test you need a couple of entries in the hosts file:

```
# add host entries for testing
127.0.0.1  server1.qzqzqz.com
127.0.0.1  server2.qzqzqz.com
```

A good tutorial for editing the hosts file on most common system types can be found [here](https://www.howtogeek.com/howto/27350/beginner-geek-how-to-edit-your-hosts-file/)


The simplest example of using this package is demonstrated by setting up some routes using http. 

The index.ts would contain:

> TypeScript
```ts
import { 
  HttpReverseProxy,
  SimpleHttpServer,
  Statistics, 
  StatisticsServer, 
  StatisticsServerOptions,
  Logger 
  } from 'http-reverse-proxy-ts'

const stats = new Statistics()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsAndLoggingPage.html'
}

const statisticsServer = new StatisticsServer(statisticsServerOptions)
const logger = new Logger()

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

server1.start()
server2.start()

const proxy = new HttpReverseProxy({ stats: stats, log: logger })

proxy.addRoute('http://server1.qzqzqz.com', 'localhost:8001')
proxy.addRoute('http://server2.qzqzqz.com', 'localhost:8002')

logger.info(null,'Proxy server started')

```
| [StatisticsServerOptions](#statistics-server-options) |

The SimpleHTTPServer is a small implementation of a web server; it responds with the server number, hostname and url.

You will need to compile the project. It is recommended for this example that you set the `outDir` in the `tsconfig.json` file to `.`.

Run the project:

```
node index.js
```

If you want to view the statistics from the [server](#statistics) you will need to copy the the file 'statisticsAndLoggingPage.html' from the `public` folder of the package (in node_modules) to a `public` folder at the root of your project. The statistics server defaults to localhost:3001.

If you want to view the log from the browser change the line:

```ts
const logger = new Logger()
```
to

```ts
const logger = new Logger({port: 3002, logLevel: 10})
```
This is cause the logger to create an http server at port 3002 which will forward log message to the statistics web page.

In the browser address bar on the same machine type:
http://server1.qzqzqz.com

This should bring up the hello message from server1.

Change the address to http://server2.qzqzqz.com and the second server should respond.

You are now running a reverse proxy sharing a single front end ip address (port 80) and routing requests to two applications.

Change the address to http://localhost:3001 to view the statistics.

If you add another route: `proxy.addRoute('server1.qzqzqz.com/statistics', 'localhost:3001')` the statistics can be viewed via the address http://server1.qzqzqz.com/statistics.

## Running a simple secure HTTPS server

Running an Https server is a bit more complex. The complexity is due to the requirement for `certficates`. 

Certificates verify the
authenticity of the server (usually the domain or host name) and set the groundwork for encrypting the data passing between the browser and the server.

A certificate is only valid if it is backed-up by a trusted [certificate authority](https://en.wikipedia.org/wiki/Certificate_authority).

There are a large number of organizations that will grant a certificate for a domain or host name. Most of them charge a fee. 

For this example of an https server we will use a self-signed certificate. A self-signed certificate 
is generated locally and does not have a valid certificate authority backing it up. 

There is also free service that will grant certificates if you can prove you own the domain or host name. This 
service is called `LetsEncrypt`. A later example shows how to set that up.

> Typescript

```ts
import {
  HttpReverseProxyOptions,
  HttpReverseProxy,
  LetsEncryptSelfSignedOptions,
  LetsEncryptUsingSelfSigned,
  RouteRegistrationOptions,
  SimpleHttpServer,
  Statistics,
  StatisticsServerOptions,
  StatisticsServer,
  Logger
} from 'http-reverse-proxy-ts'

const stats = new Statistics()
const logger = new Logger()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsAndLoggingPage.html'
}

const letsEncryptServerOptions: LetsEncryptSelfSignedOptions = {

  organizationName: 'Self testing',
  country: 'US',
  state: 'AnyState',
  locality: 'AnyTown'
}

const httpReverseProxyOptions: HttpReverseProxyOptions = {

  letsEncryptOptions: letsEncryptServerOptions,

  httpsOptions: {

    port: 443,

    certificates: {

      certificateStoreRoot: './certificates'
    },
  },

  stats: stats,
  log: logger,
}

const routingOptions: RouteRegistrationOptions = {

  https: {

    redirectToHttps: true,

    letsEncrypt: {

      email: 'myname@mydomain.com',
      production: false,
    }
  }
}

const statisticsServer = new StatisticsServer(statisticsServerOptions)

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

server1.start()
server2.start()

const proxy = new HttpReverseProxy(httpReverseProxyOptions, LetsEncryptUsingSelfSigned)

proxy.addRoute('https://server1.qzqzqz.com', 'localhost:8001', routingOptions)
proxy.addRoute('https://server2.qzqzqz.com', 'localhost:8002', routingOptions)

logger.info(null, 'Https Reverse Proxy server started')

```
[HttpReverseProxyOptions](#http-server-options) | [LetsEncryptSelfSignedOptions](#lets-encrypt-options) | [RouteRegistrationOptions](#route-registration-options) | [StatisticsServerOptions](#statistics-server-options)

As in the http example we set up two local http servers. These servers do not use https.

The reverse proxy is configured to accept http and https connections. If certificates are required (which will be 
true the first time the example is run) they will be provided by the Let's Encrypt self signed service which will
run locally.  

These certificates will will give you a warning in the browser. 

The routes are configured to force an http connection from the browser to be redirected to an https
connection on the proxy.

The certificates will be stored
in the file system at the location specified by the `certificateStoreRoot`. The directory structure for the
certificate store will be:

```
{certificateStoreRoot}
  |
  |-> server1_qzqzqz_com
  | |
  | |- server1_qzqzqz_com-crt.pem
  | |- server1_qzqzqz_com-key.pem
  |
  |-> server2_qzqzqz_com
    |
    |- server2_qzqzqz_com-crt.pem
    |- server2_qzqzqz_com-key.pem
```

Compile and run the project.

In the browser address bar on the same machine type:
http://server1.qzqzqz.com

The browser should be redirected to an https connection. This connection should display an error in the browser 
stating that the connection is not secure. Select the option to open the page anyway (this varies by browser).

This should bring up the hello message from server1.

Change the address to http://server2.qzqzqz.com and after being redirected and accepting the insecure certificates 
the second server should respond.

You are now running a (somewhat) secure reverse proxy sharing a single front end ip address (port 443).

Notice that the servers themselves (localhost:8001 and localhost:8002) are not secure. The packets from the proxy to the 
local servers are not encrypted. This is fine when the servers are on your local machine or on a local (secure) network. For
servers that are outside of your control the connection on the back side should also be secure. See [below](#route-registration-options).

---

## Running a Let's Encrypt secure proxy

To test the retrieval of certificates from Let's Encrypt, you need a hostname directed to your ip-address (the network side of the router). You also need to instruct your router to forward packets arriving on port 80 and port 443 to your local system. A starting point can be found [here](https://www.howtogeek.com/66214/how-to-forward-ports-on-your-router/)

You can obtain a temporary host name from  sites like [no-ip](https://www.noip.com/remote-access) or [DysDNS](https://dyn.com/remote-access/). I am sure there a many others.


> Typescript

```ts
import {
  HttpReverseProxyOptions,
  HttpReverseProxy,
  LetsEncryptClientOptions,
  LetsEncryptUsingAcmeClient,
  RouteRegistrationOptions,
  SimpleHttpServer,
  Statistics,
  StatisticsServerOptions,
  StatisticsServer,
  Logger
} from 'http-reverse-proxy-ts'

const hostname = '<Your Host Name>' // replace this with your actual host name
const stats = new Statistics()
const logger = new Logger()

const statisticsServerOptions: StatisticsServerOptions = {

  stats: stats,
  htmlFilename: './public/statisticsAndLoggingPage.html'
}

const letsEncryptServerOptions: LetsEncryptClientOptions = {
  noVerify: true
}

const httpReverseProxyOptions: HttpReverseProxyOptions = {

  letsEncryptOptions: letsEncryptServerOptions,

  httpsOptions: {

    port: 443,

    certificates: {

      certificateStoreRoot: './certificates'
    },
  },

  stats: stats,
  log: logger,
}

const routingOptions: RouteRegistrationOptions = {

  https: {

    redirectToHttps: true,

    letsEncrypt: {

      email: 'myname@mydomain.com', // This needs a real email address
      production: false, // change this to true once testing is complete
    }
  }
}

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

const statisticsServer = new StatisticsServer(statisticsServerOptions)

// @ts-ignore
if ( hostname === '<Your Host Name>'){

  logger.error({hostname:hostname}, `hostname in 'letsEncryptHostTestProxy.ts' must be set to your registered host name`)
  
  process.exit(0)
}

server1.start()
server2.start()

const proxy = new HttpReverseProxy(httpReverseProxyOptions, LetsEncryptUsingAcmeClient)

proxy.addRoute(hostname, 'localhost:8001', routingOptions)
proxy.addRoute(hostname, 'localhost:8002', routingOptions) // round robin between servers

logger.info({hostname: hostname}, 'Https Lets Encrypt Test Proxy started')
```
[HttpReverseProxyOptions](#http-server-options) | [LetsEncryptClientOptions](#lets-encrypt-options) | [RouteRegistrationOptions](#route-registration-options) | [StatisticsServerOptions](#statistics-server-options)

Once the ground-work is laid, replace `<Your Host Name>` with your registered hostname and replace the email address with your own. Compile and run the project.

The proxy will start and request a certificate from Let's Encrypt for your hostname. This certificate will not be backed by a `certificate authority`. However, Once you have verified the system is working you can change the routingOptions.https.letsEncrypt.production to 'true', delete the old certificates and run it again.

In a manner similar to the prior examples, enter your host name into the browser and you should receive a response from Server1 or Server2. If you have not received a producton certificate you will get the same warning as the self signed certificates.

Some modern routers will not allow you to open a page with the web address of the router. This is an attempt to twart a hack called `DNS rebinding`. If the browser cannot open the page, try your phone with the wi-fi turned off. 

---

# Http Reverse Proxy

This is the class providing the primary interface to the reverse poxy server. Other than the plethora of [options](#configuration-options) it has two main interfaces:

## Add Route

```ts
  addRoute (from: string | Partial<URL>,
    to: string | ProxyUrl | (string | ProxyUrl)[],
    registrationOptions?: RouteRegistrationOptions): HttpReverseProxy
```
addRoute() will add a non-duplicate route to the routing server. `from` refers to the inbound host and url (the source) and `to` refers to the outbound host and url (target). Routes are duplicate if the source host and url are equivalent and the destination host and url are equivalent. The [RouteRegistrationOptions](#route-registration-options) are the specifications for this particular route. Adding additional targets to a route will not override the options from the first instantiation of the route.


## Remove route
```ts
  removeRoute (from: string | Partial<URL>,
    to?: string | ProxyUrl | (string | ProxyUrl)[]): HttpReverseProxy
```
removeRoute() will remove one or more routes. If no targets are specified, all of the targets will be removed. When the route has no more targets, it will be removed. RemoveRoute will silently ignore requests to remove a route that does not exist.

Both addRoute and removeRoute can be chained in standard `.` notation:

```ts

proxy = new HttpReverseProxy ()
  .addRoute('server1.qzqzqz.com', 'localhost:8000')
  .addRoute('server2.qzqzqz.com', 'localhost:8001')

```
# Statistics

The statistics service will collect runtime statistics for the proxy. For performance considerations the in-memory statistics table is about as simple as possible. Each statistic consists of a name and a count. All counts are updated in place and no history is provided. The Statistics container and Statistics service should be started before the proxy:

```ts
const statistics = new Statistics()

const statisticsServerOptions: StatisticsServerOptions = {
  stats: statistics,
  http: {
    port: 3001
  },

  webSocket: {
    interval: 1000
  }
}

const statisticsServer = new StatisticsServer(statisticsServerOptions)

const httpProxyOptions: HttpProxyOptions = {
  // any http options required

  stats: statistics
}

const proxy = new HttpReverseProxy(httpProxyOptions)

// add a route to the proxy to access the statistics server from the outside

proxy.addRoute ('server1.qzqzqz.com/statistics', 'localhost:3001')
```

This configuration will allow access to the statistics server through 'localhost:3001' or as 'server1.qzqzqz.com/statistics'.

The server does not provide any security.

The Statistics container will collect the statistics as long as the proxy is running.

The server will provide the current state of the statistics table through a webSocket interface. The table is sent as a single object in standard JSON format. 

Each key (property) of the object is a measurement point and the value of the property is the current count. The key consists of the workerId (number) followed by a `:` followed by the name. The name portion may also contain additional `:` characters so splitting out the workderId should be done carefully.

The default web page served by the statistics server is read from `./public/statisticsAndLoggingPage.html`. This default page can be overridden by setting the `htmlFilename` in the [StatisticsServerOptions](#statistics-server-options).

The default web page is a minimal implementation requiring no outside libraries. It will display the table with a single row for each statistic name and a column for each workerId. WorkerId 0 is the master. In a non-clustered configuration all statistics will be associated with the master.

# Logging

The logging component will function in non-clustered and clustered environments without any options.

The [options](#logging-server-options) for the Logger are only required if you wish to view the log remotely via a web page or custom application, or if you what to change the default logging level.


# Clustering

The examples given above each run in a single process. This is sufficent for small scale testing.

For a larger production environment the proxy can be run as a cluster. In a cluster a single master process is started with a number of worker processes providing the routing. The master monitors the workers and restarts any worker that exits unexpectedly. 

Clustering is enabled by setting the `clustered` option of the [httpServerOptions](#http-server-options) to either `true` or a number.

If the value is set to `true` the master process will start worker processes based on the number of cores in the cpu. You can override this by setting `clustered` to a number. The minimum is 2 the maximum is 32.

Clustering should be employed only after the non-clustered router is tested and running properly.

An example clustered server:

```ts
import cluster from 'cluster'
import { 
 HttpReverseProxy,
 SimpleHttpServer,
 Statistics,
 StatisticsServer,
 StatisticsServerOptions,
 Logger } from 'http-reverse-proxy-ts'

const stats = new Statistics()
let logger: Logger

/**
 * In a clustered environment you only want the support services 
 * running on the master
 */

if (cluster.isMaster) {

  const statisticsServerOptions: StatisticsServerOptions = {

    stats: stats,
    htmlFilename: './public/statisticsAndLoggingPage.html'
  }

  const server1 = new SimpleHttpServer(1, 8001)
  const server2 = new SimpleHttpServer(2, 8002)

  const statisticsServer = new StatisticsServer(statisticsServerOptions)

  logger = new Logger(
    {
      port: 3002,
      logLevel: 10
    }
  )

  server1.start()
  server2.start()
}
else {

  logger = new Logger()
}

const proxy = new HttpReverseProxy({ clustered: true, stats: stats, log: logger })

proxy.addRoute('http://server1.test.com', 'localhost:8001')
proxy.addRoute('http://server2.test.com', 'localhost:8002')

logger.info(null, 'Proxy server started')
```

This example will allow you to view the statistics and log from 
a single web page similar to the examples above.

# Configuration Options

## HTTP Server options

```ts
interface HTTPReverseProxyOptions {
  port?: number
  host?: string
  proxyOptions?: ExtendedProxyOptions
  httpsOptions?: HttpsServerOptions
  clustered?: boolean | number
  letsEncryptOptions?: BaseLetsEncryptOptions
  preferForwardedHost?: boolean,
  log?: Logger
  stats?: Statistics
}
```
[ExtendedProxyOptions](#extended-proxy-options) | [HttpsServerOptions](#https-server-options) | [BaseLetsEncryptOptions](#lets-encrypt-options)

Option | Type | Default | Description 
--- | --- | --- | ---
__port__ | number | `80` | The inbound port used to listen for http connections.
__host__ | network-address | all | The network interface to listen for http connections. Defaults to all [interfaces](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback). This would only be used to force the system to listen on a single network. The format is a standard IPV4 or IPV6 network address. This has no relation to a host or hostname in a URL.
__proxyOptions__ | object | [See below](#default-proxy-options) | Options passed to the `node-http-proxy` instance used by this package. A complete list of the options can be found [here](https://github.com/http-party/node-http-proxy#options). Defaults below.
__httpsOptions__ | object | [See below](#default-https-options) | The https interface options.
__clustered__ | boolean or number | `false` |  If specified the system will run a number of individual monitored proxy processes. The master process will automatically restart any worker process that dies unexpectedly. If this option is a boolean `true` the number of worker processes will equal the number of cores on the processor. If this option is a number it is the number of worker processes to start. The minimum is 2 the maximum is 32 and is silently enforced.
__letsEncryptOptions__ | object | [See below](#default-letsencrypt-options) | The Let's Encrypt server options.
 __preferForwardedHost__ | boolean | `false` | This is not normally set unless the proxy server is behind other proxies. When true the forwarded host (if one is specified) from the http header is used as the key to the routing table, otherwise it is the host field of the request. 
__log__ | object | `null` | The logging element
__stats__ | object | `null` | An instance of a statitics class

## HTTPS server options

```ts
interface HttpsServerOptions {
  port?: number
  certificates: Certificates | CertificateOptions
  host?: string
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  httpsServerOptions?: https.ServerOptions
}
```
Option | Type | Default | Description
---|---|---|---
__port__ | number | `443` | The inbound port used to listen for https connections
__certificates__ | object | [See Below](#certificates) | [Certificate](#certificates) object.
__host__ | network-address | http [host](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback) | The network interface to listen for https connections. This would only be used to force the system to listen on a single network. The format is a standard IPV4 or IPV6 network address. This has no relation to a host or hostname in a URL.
 __keyFilename__ | string | `null` | Optional path and file name for the default certificate private key. The default certificate is used when a https route does not specify key and certificate files or is not configured to use LetsEncrypt. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded private key file.
 __certificateFilename__ | string | `null` | Optional path and file name for the default certificate file. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded certificate file.
 __caFilename__ | string | `null` | Optional path and file name for the default certificate authority file. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded certificate authority file.
 __httpsServerOptions__ | object | `null` | The set of options as specified by the node https create server found [here](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener).

---

## Let's Encrypt Options

```ts
interface BaseLetsEncryptOptions {
  host?: string
  port?: number
  certificates?: Certificates
  dnsChallenge?: AbstractDNSUpdate
  dnsNameServer?: string
  log?: Logger
  stats?: Statistics
}
```
[Certificates](#certificates) | [AbstractDNSUpdate](#dns-update) | [Logger](#simple-logger) | [Statistics](#statistics)

Option | Type | Default | Description
---|---|---|---
__host__ | string | all | The network interface to listen for http connections. Defaults to all [interfaces](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback). This would only be used to force the system to listen on a single network. The format is a standard IPV4 or IPV6 network address. This has no relation to a host or hostname in a URL.
__port__ | number | `3000` | The inbound port used to listen for http connections for the LetsEncrypt local server.
__certificate__ | [Certificates](#certificates) | httpOptions.certificates | The certificate store for theLetsEncrypt managed certificates.
__dnsChallenge__ | BaseDNSUpdate | null | For LetsEncrypt registrations that require the use of the dns-01 challenge (i.e. wildcard host names: *.qzqzqz.com) this is the implementation of the DNS challenge handler for the DNS service. If the challenge handler for the DNS service you use is not provided one must be written to access the DNS and add/remove the appropriate DNS TXT record.
__dnsNameServer__ | string | null | After writing the entry to the DNS table, the DNS challenge may verify the entry has been propagated within the cluster of name servers on the service before asking LetsEncrypt to look for it.
__log__ | object | null | The logging element
__stats__ | object | null | the Statistics element

## DNS Update Options

The DNS update requires a targeted implementation for each DNS service. The initial release only supports GoDaddy. However, this should provide users with an understanding of the framework required to implement other interfaces.

To facilitate the implementation of other interfaces the DNS update is supported by an abstract base class:

```ts
export interface BaseDNSUpdateOptions{
  
  stats?: Statistics
  log?:Logger
}
```
Option | Type | Default | Description
---|---|---|---
stats | [Statistics](#statistics) | null | A reference to the Statistics object.
log | [Logger](#simple-logger) | null | A reference to a logging object.

The DNS class exposes two abstract methods for managing the update:

```ts
  abstract async addAcmeChallengeToDNS (domain: string, challenge: string): Promise<boolean>
  abstract async removeAcmeChallengeFromDNS (domain: string): Promise<boolean>
```

addAcmeChallengeToDNS should add a DNS TXT record for the domain. 

removeAcmeChallengeFromDNS should remove the TXT record.

The package contains an implementation of the DNS challenge for the GoDaddy DNS service. You can use this as a template for implementing the DNS challenge on other services.

---
## DNS Update Using GoDaddy

The GoDaddy DNS update requires an APIKey and secret. These can be generated via the developer interface on GoDaddy

```ts
export interface GoDaddyDNSUpdateOptions extends BaseDNSUpdateOptions {

  APIKey: string
  secret: string
}
```
Option | Type | Default | Description
---|---|---|---
APIKey | string | none | The APIKey generated by GoDaddy
secret | string | none | The secret generated by GoDaddy. This should not be published in your code.

___

## Route Registration Options

```ts
export interface RouteRegistrationOptions {
  https?: RegistrationHttpsOptions,
  secureOutbound?: boolean
  useTargetHostHeader?: boolean
  stats?: Statistics
}

```
Option | Type | Default | Description
---|---|---|---
https | [object](#route-registration-https-options) | null | The specification of the front side (inbound) https connection. 
secureOutbound | boolean | false | Specifies the outbound connection should be secure (https) and the credentials should be checked.
useTargetHostHeader | boolean | false | If true and the inbound http packet has an `x-forwarded-host` header the first element of the x-forwarded-host header is used as the host name. Otherwise the host header is used. This should be set to true if your proxy sits behind another proxy.
stats | [object](#statistics) | null | If not null (or undefined) the Statistics object will be used to keep track of the route statistics.

---

## Route registration https options

```ts
export interface RegistrationHttpsOptions {
  redirectToHttps: boolean
  keyFilename?: string
  certificateFilename?: string
  caFilename?: string
  letsEncrypt?: RegistrationLetsEncryptOptions
}

```
Option | Type | Default | Description
---|---|---|---
redirectToHttps | boolean | none | If true http connections will be redirected to use the https connection. Otherwise the http connection will will be routed to the specified server. In normal https proxying this should be set to true.
keyFilename | string | none | If the host for this route has a commercially generated certificate this should be the path and filename for the private key file for the certificate. This file reference is global. It is not relative to the certificateStoreRoot.
certificateFilename | string | none | If the host for this route has a commercially generated certificate this should be the path and filename for the certificate file for the certificate. This file reference is global. It is not relative to the certificateStoreRoot.
caFilename | string | none | If the host for this route has a commercially generated certificate this should be the path and filename for the certificate authority file for the certificate. This file reference is global. It is not relative to the certificateStoreRoot.
letsEncrypt | [object](#route-registration-lets-encrypt-options) | none | An https route should have either a set of commercial certificate files (keyFilename, certificateFilename) or use letsEncrypt to generate the certificate pair. 

---

## Route registration Lets Encrypt options

```ts
export interface RegistrationLetsEncryptOptions {
  email: string
  production?: boolean,
  renewWithin?: number,
  forceRenew?: boolean
}
```
Option | Type | Default | Description
---|---|---|---
__email__ | string | none | This is the email address that will be used to set up an account on the LetsEncrypt service. It must be a vaild email address.
__production__ | boolean | false | The LetsEncrypt service provides a testing/staging environment which allows you to verify you have everything configured correctly before you request a real certificate. The certificates generated in the staging environment will have the same issues in the browser as the self signed certificates.
__renewWithin__ | number | 30 | The LetsEncrypt certificates are valid for 90 days. They need to be renewed periodically. This value is the number of days prior to expiration a new certificate should be requested.
__forceRenew__ | boolean | false | If true a new certificate will always be requested at startup.

The proxy maintains timers to re-generate the request for a new certificate before they expire. If the request fails, it will wait a day and try again.

---

## Certificates
```ts
certificateStoreRoot: string
log?: Logger
stats?: Statistics
```
Option | Type | Default | Description
---|---|---|---
__certificateStoreRoot__ | string | none | This is the path (relative or fixed) to the root folder of the certificate files managed by LetsEncrypt.
__log__ | [object](#simple-logger) | null | The logging element
__stats__ | [object](#statistics) | null | The Statistics element

---

At a minimum this must specify the file path to the root of the certificate store. i.e.:

```ts
certificateStoreRoot: '../certificates'
```
This is the default value used by the https server if none is provided.

## Statistics server options

```ts
export interface StatisticsServerOptions {
  stats: Statistics
  noStart?: boolean
  htmlFilename?: string
  http?: StatisticsServerHttpOptions
  websocket?: StatisticsServerWebsocketOptions
}
```

Option | Type | Default | Description
---|---|---|---
__stats__ | [object](#statistics) | none | The instance of the Statistics class maintaining the counts.
__noStart__ | boolean | false | When set to true the server must be started manually later in the startup process.
__htmlFilename__ | string | ./public/statisticsPage.html | The page served from the Statistics server.
__http__ | [object](#statistics-server-http-options) | {port: 3001} | The configuration options for the http side of the statistics server.
__websocket__ | [object](#statistics-server-websocket-options) | {interval: 5000} | The configuration options for the websocket side of the statistics server.

---

# Statistics server http options
```ts
export interface StatisticsServerHttpOptions {
  host?: string
  port: number
}
```
Option | Type | Default | Description
---|---|---|---
__host__ | network-interface | [all](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback) | The network interface. 
__port__ | number | 3001 | The inbound port used to listen for http connections.

---

## Statistics server websocket options

```ts
export interface StatisticsServerWebsocketOptions {
  updateInterval?: number
  filter?: string[]
}
``` 
Option | Type | Default | Description
---|---|---|---
updateInterval | number | 5000 | The interval between updates being pushed from the statistics server to the web client, in milliseconds
filter | string[] | none | A set of filters to limit the number of properties sent. Each filter is compared to the start of the name portion of the property. An exact match allows the property to be sent.
---

## Logging server options

```ts
export interface LoggingServerOptions {
  host?: string
  port?: number
  htmlFilename?: string
  logLevel?: number
}
```
Option | Type | Default | Description
---|---|---|---
__host__ | network-interface | [all](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback) | The network interface. 
__port__ | number | 3002 | The inbound port used to listen for http connections.
__htmlFilename__ | string | none | The page served from the Logging server.
__logLevel__ | number | 40 | The severity of the type of log message. 10 - debugging and above, 20 - tracing and above, 30 - info and above, 40 warnings and above, 50 - errors and above, 60 - Fatal errors only

# Defaults

When no options are passed the following default options are used:

## Default http options

```ts
port: 80,
proxyOptions: defaultProxyOptions,
httpsOptions: null,
preferForwardedHost: false,
```

## Default proxy options
```ts
ntlm: false,
prependPath: false,
secure: true,
```

## Default https options
```ts
port: 443,
certificates: {
  certificateStoreRoot: '../certificates'
}
```

## Default letsEncrypt options
```ts
port: 3000
```

## Default statistics server options

```ts
port = 3001
htmlFilename = './public/statisticsAndLoggingPage.html'
updateInterval = 5000
```

# How it works
 
The server listens on the designated http port. This defaults to port 80.
The server will also listen on the designated https port when it is configured with [HttpsServerOptions](#https-server-options). The port defaults to 443.
Both servers will listen on all networks if a `host` is not specified.

When a request is received on either port, the system will determine the correct outbound server for the request. The process of specifying the relationship between the inbound request and the outbound request is handled via the [addRoute](#add-route) method.

Each call to [addRoute](#add-route) specifies an inbound host:port/url and an outbound host:port/url. The simplest route would be something like:

```ts
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9000')
```
This would forward http requests with a host header of `myserver.mydomain.com` to the http server listening to port 9000 on the local machine. The url from the inbound request would be appended to the outbound request:

```
myserver.mydomain.com/login => localhost:9000/login
```

Adding a second route using the same inbound host would cause the proxy server to alternate requests between the servers:

```ts
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9001')
```

This adds a second server (listening on a different port) to handle requests to 'myserver.mydomain.com'. The first request might go to the server on port 9000, the second to the server on port 9001, the third to the server on port 9000, etc.

The round robin forwarding is for each http request, not each page. There are frequently many http requests to retrieve the contents of a single page. There should be no expectation of the server choosen.

Both calls can be combined as follows:

```ts
proxyServer.addRoute('myserver.mydomain.com', ['localhost:9000', 'localhost:9001'])
```

There are practical limits to the number of target servers. A request to add a target server more than once will be silently ignored.

The load or responsibilities of the target servers can also be managed by routing some requests to one server and other requests to a different server:

```ts
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9000')
proxyServer.addRoute('myserver.mydomain.com/api', 'localhost:9001')
```

This configuration would route requests with '/api' as the root of the inbound url to go to the server on port 9001. All other requests would go to the server on port 9000. The url forwarded to the server on port 9001 would have the root ('/api') removed:

```
myserver.mydomain.com/api/getusers => localhost:9001/getusers
```

The target server can also specify a base route:

```
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9001/api')
```

The resulting requests would have the root ('/api') prepended to the url received by the server at port 9001

```
myserver.mydomain.com/getusers => localhost:9001/api/getusers
```

Urls can be on both sides of the route specification:

```
proxyServer.addRoute('myserver.mydomain.com/api', 'localhost:9001/apihandler')
```
```
myserver.mydomain.com/api/getusers => localhost:9001/apihandler/getusers
```

# Examples

The package contains a number of examples similar to those documented above. The package.json file allows easy access to these examples. To run the examples:

  Clone the project via the command: `git clone https://github.com/TrueLabCreations/http-reverse-proxy.git` in a local directory.

  If you want to test the installation run: `npm test`. This will run a set of blackbox tests. The tests require the addition of 9 host entries:

```
    127.0.0.1 server1.qzqzqz.com
    127.0.0.1 server2.qzqzqz.com
    .
    .
    .
    127.0.0.1 server9.qzqzqz.com
```

The examples require host entries for the first 2 servers above.

To run the http example enter: `npm start`.

To run the https example enter: `npm run httpsExample`

To run the LetsEncrypt example you must edit the file `./src/examples/letsEncryptProxy.ts` and replace `<Your Host Name>` with the hostname you own that is routed to your network, and the email address in the letsEncryptOptions. Then enter: `npm run letsEncryptExample`.

To run a clustered server enter: `npm run clusteredExample`.

All of the examples start the statistics and logging servers. You can view the statistics and log by opening `localhost:3001`.

Hopefully, the examples will shed more light on how you can build your own proxy service.

# Issues

Please post any bugs, questions, enhancement requests, or comments at: `https://github.com/TrueLabCreations/http-reverse-proxy/issues`.

# Acknowledgements

The [node](https://nodejs.org) team continues to do exceptional work.

The core of the proxy system is provided by [http-proxy](https://github.com/http-party/node-http-proxy). It is a solid package.

The [acme-client](https://github.com/publishlab/node-acme-client) provides the Lets Encrypt interface. Again, this is a solid piece of work.

The certificate and encryption tools are provided by [forge](https://github.com/digitalbazaar/forge). These people are deep in the weeds.

I got the idea for this from [redbird](https://github.com/OptimalBits/redbird). This is a great http reverse proxy implementation. I just wanted one coded in TypeScript.
 
Then there is [TypeScript](https://www.typescriptlang.org/). If you don't use it, you should try. It attempts to bring the past 50 years of programming language development to the JavaScript world.

I work exclusively in [vsCode](https://code.visualstudio.com/). Pretty close to perfect.

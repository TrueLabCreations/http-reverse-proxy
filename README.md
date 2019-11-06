# HTTP/HTTPS Reverse Proxy

## Running a simple http reverse proxy server

Before we start we need a couple of entries in the hosts file:

```
# add host entries for testing
127.0.0.1  server1.test.com
127.0.0.1  server2.test.com
```

A good tutorial for editing the hosts file on most common system types can be found [here](https://www.howtogeek.com/howto/27350/beginner-geek-how-to-edit-your-hosts-file/)


> TypeScript
```ts
import ReverseProxy from 'httpReverseProxy'
import SimpleHTTPServer from './simpleHttpServer'

const server1 = new SimpleHTTPServer(1, 8001)
const server2 = new SimpleHTTPServer(2, 8002)

server1.start()
server2.start()

const proxy = new ReverseProxy()

proxy.addRoute('http://server1.test.com', 'localhost:8001')
proxy.addRoute('http://server2.test.com', 'localhost:8002')

console.log('Proxy server started')

```

The SimpleHTTPServer is a small implementation of a web server

Compile and run the project.

In the browser address bar on the same machine type:
http://server1.test.com

This should bring up the hello message from server1.

Change the address to http://server2.test.com and the second server should respond

You are now running a reverse proxy sharing a single front end ip address (port 80)

>Running a simple secure (with self signed certificates) HTTPS server

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
  log?: LoggerInterface
  stats?: Statistics
}
```

>port: {number} The inbound port used to listen for http connections. Defaults to 80

>host: {network-address} The network interface to listen for http connections. Defaults to all [interfaces](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback). This would only be used to force the system to listen on a single network. The format is a standard IPV4 or IPV6 network address. This has no relation to a host or hostname in a URL.

>proxyOptions: {object} The http-proxy options. A complete list of the options can be found [here](https://github.com/http-party/node-http-proxy#options). 
Defaults to:

```ts
{
  ntlm: false,
  prependPath: false,
  secure: true,
}
```

> httpsOptions: {object} The https interface options. Defaults to:

```ts
{
  port: 443,
  certificates: {
    certificateStoreRoot: '../certificates'
  }
}
```
> clustered: {boolean or number} If specified the system will run a number of individual monitored proxy processes. The master process will automatically restart any worker process that dies unexpectedly. The number of worker processes will be the number of cores on the processor if this value is set to true or the number specified if it is a number. The minimum is 2 the maximum is 32 and is silently enforced.

> letsEncryptOptions: {object} The Let's Encrypt server options. Defaults to:

```ts
{
  port: 3000
}
```

> preferForwardedHost: {boolean} When true the forwarded host (if one is specified) from the http header is used as the key to the routing table, otherwise it it the host field of the request. Defaults to false. This is not normally set unless the proxy server is behind other proxies.

> log: {object} The logging element

> stats: {object} An instance of a statitics class

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
> port: {number} The inbound port used to listen for http connections. Defaults to 443

> certificates: {object} 

```ts
{
  certificateStoreRoot: string
  log?: LoggerInterface
  stats?: Statistics
}
```
At a minimum this must specify the file path to the root of the certificate store. i.e.:

```ts
{
  certificateStoreRoot: '../certificates'
}
``` 
> host: {network-address} The network interface to listen for http connections. Defaults to the http [hosts](https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback). This would only be used to force the system to listen on a single network. The format is a standard IPV4 or IPV6 network address. This has no relation to a host or hostname in a URL.

> keyFilename {string} optional path and file name for the default certificate private key. The default certificate is used when a https route does not specify key and certificate files or is not configured to use LetsEncrypt. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded private key file.

> certificateFilename {string} optional path and file name for the default certificate file. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded certificate file.

> caFilename {string} optional path and file name for the default certificate authority file. This should be a [PEM](https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail) encoded certificate authority file.

> httpsServerOptions: {object} this is the set of options as specified by the node https create server found [here](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener).
 
## How it works
 
The server listens on the designated http port. This defaults to port 80.
The server will also listen on the designated https port when it is configured with *HttpsServerOptions*. The port defaults to 443.
Both servers will listen on all networks if a network *interface* is not specified.

When a request is received on either port, the system will determine the correct outbound server for the request. The process of specifying the the relationship between the inbound request and the outbound request is handled via the *addRoute* method.

Each call to *addRoute* specifies and inbound host:port/url and an outbound host:port/url. The simplest route would be something like:

```js
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9000')
```
This would forward http requests with the host header 'myserver.mydomain.com' to the http server listening to port 9000 on the local machine. The url from the inbound request would be appended to the outbound request:

```js
myserver.mydomain.com/login => localhost:9000/login
```

Adding a second route using the same inbound host would cause the proxy server to alternate requests between the servers:

```js
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9001')
```

This adds a second server (listening on a different port) to handle requests to 'myserver.mydomain.com'. The first request would go to the server on port 9000, the second to the server on port 9001, the third to the server on port 9000, etc.

The round robin forwarding is for each http request, not each page. There are frequently many http requests to retrieve the contents of a single page.

Both calls can be combined as follows:

```js
proxyServer.addRoute('myserver.mydomain.com', ['localhost:9000', 'localhost:9001'])
```

There are practical limits to the number of target servers.

The load or responsibilities of the target servers can also be managed by routing certain requests to one server and other request to a different server:

```js
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9000')
proxyServer.addRoute('myserver.mydomain.com/api', 'localhost:9001')
```

This configuration would route requests with '/api' as the root of the inbound url to go to the server on port 9001. All other requests would got to the server on port 9000. The url forwarded to the server on port 9001 would have the root ('/api') removed:

```js
myserver.mydomain.com/api/getusers => localhost:9001/getusers
```

The target server can also specify a base route:

```js
proxyServer.addRoute('myserver.mydomain.com', 'localhost:9001/api')
```

The resulting requests would have the root ('/api') prepended to the url received by the server at port 9001

```js
myserver.mydomain.com/getusers => localhost:9001/api/getusers
```


import ReverseProxy from '../src/httpReverseProxy'
import SimpleHTTPServer from './simpleHttpServer'

const server1 = new SimpleHTTPServer(1, 8001)
const server2 = new SimpleHTTPServer(2, 8002)

server1.start()
server2.start()

const proxy = new ReverseProxy()

proxy.addRoute('http://server1.test.com', 'localhost:8001')
proxy.addRoute('http://server2.test.com', 'localhost:8002')

console.log('Proxy server started')


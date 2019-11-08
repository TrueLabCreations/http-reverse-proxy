import { HttpReverseProxy } from '../lib/httpReverseProxy'
import { SimpleHttpServer } from './simpleHttpServer'

const server1 = new SimpleHttpServer(1, 8001)
const server2 = new SimpleHttpServer(2, 8002)

server1.start()
server2.start()

const proxy = new HttpReverseProxy()

proxy.addRoute('http://server1.test.com', 'localhost:8001')
proxy.addRoute('http://server2.test.com', 'localhost:8002')

console.log('Proxy server started')


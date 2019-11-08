import {HttpReverseProxy} from './src/lib/httpReverseProxy'
import {SimpleHttpServer} from './src/examples/simpleHttpServer'
import {SimpleLogger} from './src/examples/simpleLogger'
new SimpleHttpServer(1,8001).start()
new SimpleHttpServer(2,8002).start()

new HttpReverseProxy({log:new SimpleLogger()})
.addRoute('server1.test.com', 'localhost:8001')
.addRoute('server2.test.com', 'localhost:8002')
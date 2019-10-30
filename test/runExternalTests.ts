import http from 'http'
import net from 'net'
import HTTPReverseProxy, { HTTPReverseProxyOptions } from '../src/httpReverseProxy'
import simpleLogger from '../src/simpleLogger'

let server1 = null
let server2 = null
let server3 = null

let randomPayload1: string
let randomPayload2: string
let randomPayload3: string

const startServers = () => {
  server1 = http.createServer((req, res) => {

    if (req.url === '/random') {
      res.end(randomPayload1)
    }
    else {
      res.end(`Test succeeded. Port 9001. URL:${req.url}`)
    }
  }).listen(9001)

  server2 = http.createServer((req, res) => {
    if (req.url === '/random') {
      res.end(randomPayload2)
    }
    else {
      res.end(`Test succeeded. Port 9002. URL:${req.url}`)
    }
  }).listen(9002)

  server3 = http.createServer((req, res) => {
    // console.log (`Server 3: ${req.headers['x-forwarded-host']}` )
    if (req.url === '/random') {
      res.end(randomPayload3)
    }
    else {
      res.end(`Test succeeded. Port 9003. URL:${req.url}`)
    }
  }).listen(9003)

  server3.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) =>{
    socket.write('Upgrade succeeded')
    socket.end()
  })
}

const stopServers = () => {
  server1 && server1.close()
  server2 && server2.close()
  server3 && server3.close()
}

const randomString = (size: number): string => {
  
  const B: Buffer = Buffer.allocUnsafe(size)
  
  for (var i = 0; i < size; i++) {
    B[i] = randomCharacter();
  }
  
  return B.toString()
}

const randomCharacter = (): number => {

  var chars = "0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ";
  
  return chars.charCodeAt(Math.floor(Math.random() * 62))
}

const getDataFrom = async (hostname: string, expected: string) => {

  return new Promise((resolve, reject) => {

    http.get(hostname, (res) => {

      if (res.statusCode === 200) {

        let body = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          if (body === expected) {
            resolve(body)
          }
          else {
            reject(body.substr(0,80))
          }
        })
      }
      else {
        reject(res.statusMessage)
      }
    })
  })
}

const runShortTest = async (testName: string, hostname: string, expected: string) => {

  const results = {
    testName: testName,
    successCount: 0
  }

  for (let index = 0; index < 10; ++index) {

    await getDataFrom(hostname, expected)
      .then(() => {

        results.successCount++
        return
      })
      .catch((error) => {
        if ('undefined' === typeof results[error]) {

          results[error] = 1
        }
        else {
          results[error]++
        }
        return
      })
  }
  return results
}

const runTest = async () => {

  const httpProxyOptions: HTTPReverseProxyOptions = {
    proxy:{
      xfwd: true
    }
    // log: simpleLogger
  }

  const proxy: HTTPReverseProxy = new HTTPReverseProxy(httpProxyOptions)

  startServers()

  proxy.addRoute('server1.test.com', 'localhost:9001')
  proxy.addRoute('server2.test.com', 'localhost:9002')
  proxy.addRoute('server3.test.com', 'localhost:9003')
  proxy.addRoute('server1.test.com/testing', 'localhost:9001')
  proxy.addRoute('server2.test.com/testing', 'localhost:9002')
  proxy.addRoute('server3.test.com/testing', 'localhost:9003')
  proxy.addRoute('server1.test.com/test', 'localhost:9001/test')
  proxy.addRoute('server2.test.com/test', 'localhost:9002/test')
  proxy.addRoute('server3.test.com/test', 'localhost:9003/test')
  proxy.addRoute('server4.test.com', 'server3.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server5.test.com', 'server4.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server6.test.com', 'server5.test.com', { useTargetHostHeader: true })
  proxy.addRoute('server7.test.com', 'server6.test.com', { useTargetHostHeader: true })


  randomPayload1 = randomString(4000000)
  randomPayload2 = randomString(4000000)
  randomPayload3 = randomString(4000000)

  const start = new Date()

  const results = await Promise.all([
    runShortTest('test01', 'http://server1.test.com', `Test succeeded. Port 9001. URL:/`),
    runShortTest('test02', 'http://server2.test.com', `Test succeeded. Port 9002. URL:/`),
    runShortTest('test03', 'http://server3.test.com', `Test succeeded. Port 9003. URL:/`),
    runShortTest('test04', 'http://server1.test.com/testing', `Test succeeded. Port 9001. URL:/`),
    runShortTest('test05', 'http://server2.test.com/testing', `Test succeeded. Port 9002. URL:/`),
    runShortTest('test06', 'http://server3.test.com/testing', `Test succeeded. Port 9003. URL:/`),
    runShortTest('test07', 'http://server1.test.com/test', `Test succeeded. Port 9001. URL:/test/`),
    runShortTest('test08', 'http://server2.test.com/test', `Test succeeded. Port 9002. URL:/test/`),
    runShortTest('test09', 'http://server3.test.com/test', `Test succeeded. Port 9003. URL:/test/`),
    runShortTest('test10', 'http://server1.test.com/test/abc', `Test succeeded. Port 9001. URL:/test/abc`),
    runShortTest('test11', 'http://server2.test.com/test/abc', `Test succeeded. Port 9002. URL:/test/abc`),
    runShortTest('test12', 'http://server3.test.com/test/abc', `Test succeeded. Port 9003. URL:/test/abc`),
    runShortTest('test13', 'http://server1.test.com/test/abc/def', `Test succeeded. Port 9001. URL:/test/abc/def`),
    runShortTest('test14', 'http://server2.test.com/test/abc/def', `Test succeeded. Port 9002. URL:/test/abc/def`),
    runShortTest('test15', 'http://server3.test.com/test/abc/def', `Test succeeded. Port 9003. URL:/test/abc/def`),
    runShortTest('test16', 'http://server1.test.com/abc/def', `Test succeeded. Port 9001. URL:/abc/def`),
    runShortTest('test17', 'http://server2.test.com/abc/def', `Test succeeded. Port 9002. URL:/abc/def`),
    runShortTest('test18', 'http://server3.test.com/abc/def', `Test succeeded. Port 9003. URL:/abc/def`),
    runShortTest('test19', 'http://server7.test.com/abc/def', `Test succeeded. Port 9003. URL:/abc/def`),
    runShortTest('test20', 'http://server1.test.com/random', randomPayload1),
    runShortTest('test21', 'http://server2.test.com/random', randomPayload2),
    runShortTest('test22', 'http://server3.test.com/random', randomPayload3),
    runShortTest('test23', 'http://server7.test.com/random', randomPayload3),
  ])

  const end = new Date()

  const milliseconds = end.valueOf() - start.valueOf()

  console.log(results)
  console.log('execution duration: %sms', milliseconds)

  proxy.close()
  stopServers()

}

runTest()

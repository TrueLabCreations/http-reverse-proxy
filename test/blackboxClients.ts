import http from 'http'
import https from 'https'
import WebSocket from 'ws'

let randomPayload1: string
let randomPayload2: string
let randomPayload3: string

const httpClient = async (hostname: string, expected: string) => {

  return new Promise((resolve, reject) => {

    http.get(hostname, { agent: false }, async (res) => {

      if (res.statusCode === 200) {

        let body = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {

          if (body === expected) {
            resolve()
          }
          else {

            reject(body.substr(0, 40))
          }
        })
      }
      else {

        if (res.statusCode === 302 || res.statusCode === 301) {

          await httpsClient(res.headers.location, expected)
            .then(resolve)
            .catch(reject)
        }

        reject(res.statusMessage)
      }
    })
  })
}

const httpsClient = async (hostname: string, expected: string) => {

  return new Promise((resolve, reject) => {

    https.get(hostname, { rejectUnauthorized: false }, (res) => {

      if (res.statusCode === 200) {

        let body = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {

          if (body === expected) {
            resolve()
          }
          else {

            reject(body.substr(0, 40))
          }
        })
      }
      else {

        reject(res.statusMessage)
      }
    })
  })
}

// const httpClientWithRedirect = async (hostname: string, expected: string ) =>{

//   try{
//     await httpClient(hostname, expected)
//   }
//   catch(e){
//     await httpClient(hostname, expected)
//   }

// }

const wsClient = async (hostname: string, send: string, receive: string) => {

  return new Promise((resolve, reject) => {

    const ws = new WebSocket(hostname)

    ws.on('open', () => {

      ws.send(send)
    })

    ws.on('message', (message: string) => {

      ws.close()

      if (message === receive) {
        resolve()
      }
      else {
        reject(receive.substr(0, 40))
      }
    })

    ws.on('close', (code: number, reason: string) => {

      resolve(reason)
    })

    ws.on('error', function (err: Error) {

      reject(err.message)
    })
  })
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

const runHttpTest = async (testName: string, iterations: number, hostname: string, expected: string) => {

  const results = {
    testName: testName,
    successCount: 0
  }

  for (let index = 0; index < iterations; ++index) {

    await httpClient(hostname, expected)

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

const runWebSocketTest = async (testName: string, iterations: number, hostname: string, send: string, expected: string) => {

  const results = {
    testName: testName,
    successCount: 0
  }

  for (let index = 0; index < iterations; ++index) {

    await wsClient(hostname, send, expected)

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

export const runHttpTests = async (iterations: number) => {

  if (!iterations) {

    return
  }

  const start = new Date()

  const results = await Promise.all([

    runHttpTest('http test01', iterations, 'http://server1.qzqzqz.com', `Test succeeded. Port 9001. URL:/`),
    runHttpTest('http test02', iterations, 'http://server2.qzqzqz.com', `Test succeeded. Port 9002. URL:/`),
    runHttpTest('http test03', iterations, 'http://server3.qzqzqz.com', `Test succeeded. Port 9003. URL:/`),
    runHttpTest('http test04', iterations, 'http://server1.qzqzqz.com/testing', `Test succeeded. Port 9001. URL:/`),
    runHttpTest('http test05', iterations, 'http://server2.qzqzqz.com/testing', `Test succeeded. Port 9002. URL:/`),
    runHttpTest('http test06', iterations, 'http://server3.qzqzqz.com/testing', `Test succeeded. Port 9003. URL:/`),
    runHttpTest('http test07', iterations, 'http://server1.qzqzqz.com/test', `Test succeeded. Port 9001. URL:/test/`),
    runHttpTest('http test08', iterations, 'http://server2.qzqzqz.com/test', `Test succeeded. Port 9002. URL:/test/`),
    runHttpTest('http test09', iterations, 'http://server3.qzqzqz.com/test', `Test succeeded. Port 9003. URL:/test/`),
    runHttpTest('http test10', iterations, 'http://server1.qzqzqz.com/test/abc', `Test succeeded. Port 9001. URL:/test/abc`),
    runHttpTest('http test11', iterations, 'http://server2.qzqzqz.com/test/abc', `Test succeeded. Port 9002. URL:/test/abc`),
    runHttpTest('http test12', iterations, 'http://server3.qzqzqz.com/test/abc', `Test succeeded. Port 9003. URL:/test/abc`),
    runHttpTest('http test13', iterations, 'http://server1.qzqzqz.com/test/abc/def', `Test succeeded. Port 9001. URL:/test/abc/def`),
    runHttpTest('http test14', iterations, 'http://server2.qzqzqz.com/test/abc/def', `Test succeeded. Port 9002. URL:/test/abc/def`),
    runHttpTest('http test15', iterations, 'http://server3.qzqzqz.com/test/abc/def', `Test succeeded. Port 9003. URL:/test/abc/def`),
    runHttpTest('http test16', iterations, 'http://server1.qzqzqz.com/abc/def', `Test succeeded. Port 9001. URL:/abc/def`),
    runHttpTest('http test17', iterations, 'http://server2.qzqzqz.com/abc/def', `Test succeeded. Port 9002. URL:/abc/def`),
    runHttpTest('http test18', iterations, 'http://server3.qzqzqz.com/abc/def', `Test succeeded. Port 9003. URL:/abc/def`),
    runHttpTest('http test19', iterations, 'http://server7.qzqzqz.com/abc/def', `Test succeeded. Port 9003. URL:/abc/def`),
    runHttpTest('http test20', iterations, 'http://server1.qzqzqz.com/random', randomPayload1),
    runHttpTest('http test21', iterations, 'http://server2.qzqzqz.com/random', randomPayload2),
    runHttpTest('http test22', iterations, 'http://server3.qzqzqz.com/random', randomPayload3),
    runHttpTest('http test23', iterations, 'http://server6.qzqzqz.com/random', randomPayload3),

  ])

  const end = new Date()

  const milliseconds = end.valueOf() - start.valueOf()

  console.log(results)
  console.log('http execution duration: %sms', milliseconds)
}

export const runWebsocketTests = async (iterations: number) => {

  if (!iterations) {

    return
  }

  const start = new Date()

  const results = await Promise.all([

    runWebSocketTest('ws test01', iterations, 'http://server1.qzqzqz.com', randomPayload1, randomPayload2),
    runWebSocketTest('ws test02', iterations, 'http://server2.qzqzqz.com', randomPayload2, randomPayload3),
    runWebSocketTest('ws test03', iterations, 'http://server3.qzqzqz.com', randomPayload3, randomPayload1),
    runWebSocketTest('ws test04', iterations, 'http://server4.qzqzqz.com', randomPayload3, randomPayload1),
    runWebSocketTest('ws test05', iterations, 'http://server7.qzqzqz.com', randomPayload3, randomPayload1),

  ])

  const end = new Date()

  const milliseconds = end.valueOf() - start.valueOf()

  console.log(results)

  console.log('ws execution duration: %sms', milliseconds)
}

export const sendRandoms = async (stringSize: number): Promise<string> => {

  randomPayload1 = randomString(stringSize)
  randomPayload2 = randomString(stringSize)
  randomPayload3 = randomString(stringSize)

  const body = JSON.stringify([randomPayload1, randomPayload2, randomPayload3])

  return new Promise((resolve) => {

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': body.length
    }

    const handleResponse = (res: http.IncomingMessage) => {

      if (res.statusCode === 200) {

        let body = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {

          resolve(body)
        })
      }
      else {

        resolve(res.statusMessage)
      }
    }

    http.request({

      method: 'PUT',
      protocol: 'http:',
      hostname: 'server1.qzqzqz.com',
      port: 80,
      path: '/random',
      headers: headers,
    }, handleResponse).write(body)
  })
}

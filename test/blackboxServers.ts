import http from 'http'
import net from 'net'
import WebSocket from 'ws'

let server1 = null
let server2 = null
let server3 = null

let wss1: WebSocket.Server = null
let wss2: WebSocket.Server = null
let wss3: WebSocket.Server = null

let randomPayload1: string
let randomPayload2: string
let randomPayload3: string

export const startServers = () => {

  wss1 = new WebSocket.Server({ noServer: true })

  wss1.on('connection', (ws: WebSocket) => {

    ws.on('message', (message: string) => {

      if (message === randomPayload1) {

        ws.send(randomPayload2)

        ws.close()
      }
      else {

        ws.send('WebSocket Server 1 receive error')
        ws.close()
      }
    })

    ws.on('close', () => {

      ws.close()
    })

  })

  wss2 = new WebSocket.Server({ noServer: true })

  wss2.on('connection', (ws: WebSocket) => {

    ws.on('message', (message: string) => {

      if (message === randomPayload2) {

        ws.send(randomPayload3)

        ws.close()
      }
      else {

        ws.send('WebSocket Server 2 receive error')
        ws.close()
      }
    })

    ws.on('close', () => {

      ws.close()
    })

  })

  wss3 = new WebSocket.Server({ noServer: true })

  wss3.on('connection', (ws: WebSocket) => {

    ws.on('message', (message: string) => {

      if (message === randomPayload3) {

        ws.send(randomPayload1)

        ws.close()
      }
      else {

        ws.send('WebSocket Server 3 receive error')
        ws.close()

      }
    })

    ws.on('close', () => {

      ws.close()
    })
  })

  server1 = http.createServer((req, res) => {

    if (req.url === '/random') {

      if (req.method === 'GET') {

        res.end(randomPayload1)
      }
      else {

        if (req.method === 'PUT') {

          let body = ''

          req.setEncoding('utf8')
          req.on('data', (chunk) => { body += chunk })
          req.on('end', () => {

            try {

              const randoms = JSON.parse(body)

              randomPayload1 = randoms[0]
              randomPayload2 = randoms[1]
              randomPayload3 = randoms[2]

              res.end('OK')
            }
            catch (e) {
              res.end('JSON Error')
            }
          })
        }
      }
    }
    else {
      res.end(`Test succeeded. Port 9001. URL:${req.url}`)
    }
  }).listen(9001)

  server1.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

    wss1.handleUpgrade(req, socket, head, (ws) => {

      wss1.emit('connection', ws, req)
    })
  })


  server2 = http.createServer((req, res) => {

    if (req.url === '/random') {

      res.end(randomPayload2)
    }
    else {

      res.end(`Test succeeded. Port 9002. URL:${req.url}`)
    }

  }).listen(9002)

  server2.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

    wss2.handleUpgrade(req, socket, head, (ws) => {

      wss2.emit('connection', ws, req)
    })
  })

  server3 = http.createServer((req, res) => {

    if (req.url === '/random') {

      res.end(randomPayload3)
    }
    else {

      res.end(`Test succeeded. Port 9003. URL:${req.url}`)
    }

  }).listen(9003)

  server3.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

    wss3.handleUpgrade(req, socket, head, (ws) => {

      wss3.emit('connection', ws, req)
    })

  })
}

export const stopServers = () => {

  server1 && server1.close()
  server2 && server2.close()
  server3 && server3.close()

  wss1 && wss1.close()
  wss2 && wss2.close()
  wss3 && wss3.close()
}


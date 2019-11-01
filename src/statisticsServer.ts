import http from 'http'
import net from 'net'
import fs from 'fs'
import WebSocket from 'ws'
import Statistics from './statistics'

export interface StatisticsServerHttpOptions {
  networkInterface?: string
  port: number
}

export interface StatisticsServerWebsocketOptions {
  updateInterval?: number
  filter?: string[]
}

export interface StatisticsServerOptions {
  stats: Statistics
  noStart?: boolean
  http?: StatisticsServerHttpOptions
  websocket?: StatisticsServerWebsocketOptions
}

export default class StatisticsServer {

  private networkInterface: string
  private port: number
  private updateInterval: number
  private filter: string[] = null
  private httpServer: http.Server
  private websocketServer: WebSocket.Server
  private stats: Statistics

  constructor(options: StatisticsServerOptions) {

    if (options) {

      this.setOptions(options)
      
      if (!options.noStart){
        this.start()
      }
    }
    else {

      throw Error('Missing configuration options for Statistics server')
    }
  }

  private setOptions = (options: StatisticsServerOptions) => {

    if (options) {

      this.stats = options.stats
      this.port = 3001
      this.updateInterval = 5000

      if (options.http) {

        this.networkInterface = options.http.networkInterface
        this.port = options.http.port || 3001
      }

      if (options.websocket) {

        this.updateInterval = options.websocket.updateInterval || 5000
        this.filter = options.websocket.filter
      }
    }
  }

  public start = (options?: StatisticsServerOptions) => {

    this.stop()

    this.setOptions(options)

    this.createHttpServer()
    this.createWebsocketServer()
  }

  public stop = () => {
    this.httpServer && this.httpServer.close()
    
    if (this.websocketServer){

      this.websocketServer.clients.forEach((client) =>{

        client.close()
      })

     this.websocketServer.close()
    }
  }

  private createHttpServer = () => {
    this.httpServer = http.createServer()

    this.httpServer.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      fs.readFile('../public/statisticsPage.html', (error, data) => {
        if (!error) {

          res.write(data.toString('utf8'))
          res.end()
        }
        else {

          res.write('<html><head></head><body><h1>File read error</h1></body></html>')
          res.end()
        }
      })
    })

    this.httpServer.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

      this.websocketServer.handleUpgrade(req, socket, head, (ws) => {

        this.websocketServer.emit('connection', ws, req)
      })
    })

    this.httpServer.on('listening', () => {
      console.log(`Statistics server started on port ${this.port}`)
    })

    this.httpServer.listen(this.port, this.networkInterface)
  }

  private createWebsocketServer = () => {

    this.websocketServer = new WebSocket.Server({ noServer: true })

    this.websocketServer.on('connection', (ws: WebSocket) => {

      let timer: NodeJS.Timeout

      const handleOpen = () => {

        if (timer) {

          clearInterval(timer)
          timer = null
        }

        if (this.updateInterval) {

          timer = setInterval(processUpdate, this.updateInterval)
        }
      }

      const handleClose = () => {

        if (timer) {

          clearInterval(timer)
          timer = null
        }
        ws.close()
      }

      const processUpdate = () => {

        if (this.stats) {

          ws.send(JSON.stringify(this.stats.getTable()))
        }
      }

      ws.on('open', handleOpen)

      ws.on('message', (message: string) => {

        const data = JSON.parse(message)

        if (data && data.command) {

          if (data.command === 'start') {

            handleOpen()
            processUpdate()
          }
          else {

            if (data.command === 'stop'){

              handleClose()
            }
          }
        }
      })

      ws.on('close', handleClose)

    })

  }
}
import http from 'http'
import net from 'net'
import fs from 'fs'
import WebSocket from 'ws'
import Statistics from './statistics'
import { makeUrl, respondNotFound } from './util'

export interface StatisticsServerHttpOptions {
  networkInterface?: string
  port: number
  htmlFilename?: string
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
  private htmlFilename: string
  private updateInterval: number
  private filter: string[]
  private httpServer: http.Server
  private websocketServer: WebSocket.Server
  private stats: Statistics

  constructor(options: StatisticsServerOptions) {

    if (options) {

      this.setOptions(options)

      if (!options.noStart) {
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
      this.htmlFilename = '../public/statisticsPage.html'
      this.updateInterval = 5000

      if (options.http) {

        this.networkInterface = options.http.networkInterface
        this.port = options.http.port || this.port
        this.htmlFilename = options.http.htmlFilename || this.htmlFilename
      }

      if (options.websocket) {

        this.updateInterval = options.websocket.updateInterval || this.updateInterval
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

    if (this.websocketServer) {

      this.websocketServer.clients.forEach((client) => {

        client.close()
      })

      this.websocketServer.close()
    }
  }

  private createHttpServer = () => {

    this.httpServer = http.createServer()

    this.httpServer.on('request',
      (req: http.IncomingMessage, res: http.ServerResponse) => {

        fs.readFile(this.htmlFilename, (error, data) => {

          if (!error) {

            res.write(data.toString('utf8'))
            res.end()
          }
          else {

            respondNotFound(req, res)
          }
        })
      })

    this.httpServer.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

      this.websocketServer.handleUpgrade(req, socket, head, (ws) => {

        this.websocketServer.emit('connection', ws, req)
      })
    })

    this.httpServer.on('listening', () => {
      console.log(`Statistics server started ${JSON.stringify(this.httpServer.address())}`)
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

          const table = this.stats.getTable()

          if (this.filter && Array.isArray(this.filter) && this.filter.length) {

            const properties = Object.keys(table)
            const result = {}

            for (const property of properties) {

              if (this.filter.find((filter) => property.substr(0, filter.length) === filter)) {

                result[property] = table[property]
              }
            }

            ws.send(JSON.stringify(result))
          }
          else {

            ws.send(JSON.stringify(table))
          }
        }
      }

      ws.on('open', handleOpen)

      ws.on('message', (message: string) => {

        const data = JSON.parse(message)

        if (data && data.command) {

          switch (data.command) {

            case 'start':
              handleOpen()
              processUpdate()
              break

            case 'stop':
              handleClose()
              break

            case 'setInterval':
              this.updateInterval = Number(data.interval)
              break

            case 'setFilter':
              this.filter = data.setFilter
              break
          }
        }
      })

      ws.on('close', handleClose)

    })

  }
}
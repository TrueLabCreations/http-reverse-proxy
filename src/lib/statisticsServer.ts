import http from 'http'
import net from 'net'
import fs from 'fs'
import WebSocket from 'ws'
import { Statistics } from './statistics'
import { respondNotFound } from './util'
import { Logger } from './logger'

/**
 * Configuration options for the http server started by
 * the Statistics server
 */

export interface StatisticsServerHttpOptions {
  host?: string
  port: number
}

/**
 * Configuration options for the Websocket interface to the Statistics server
 */

export interface StatisticsServerWebsocketOptions {
  updateInterval?: number
  filter?: string[]
}

/**
 * Configuration options for the statistics server
 */

export interface StatisticsServerOptions {
  stats: Statistics
  noStart?: boolean
  htmlFilename?: string
  http?: StatisticsServerHttpOptions
  websocket?: StatisticsServerWebsocketOptions
  log?: Logger
}

/**
 * The statistics server is started with an instance of the Statistics class.
 * This is most often a singleton class created in the root of the proxy startup
 * code. Statistics entries are updated in the Statistics object.
 * The Statistics server sends to current state of the Statistics instance to
 * out to the clients via a websocket interface
 */

export class StatisticsServer {

  private host: string
  private port: number
  private htmlFilename: string
  private updateInterval: number
  private filter: string[]
  private httpServer: http.Server
  private websocketServer: WebSocket.Server
  private stats: Statistics
  private log: Logger

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

  /**
   * Extract the option information from the statistics options
   */

  private setOptions = (options: StatisticsServerOptions) => {

    if (options) {

      this.stats = options.stats
      this.port = 3001
      this.htmlFilename = './public/statisticsAndLoggingPage.html'
      this.updateInterval = 5000
      this.htmlFilename = options.htmlFilename || this.htmlFilename
      this.log = options.log

      if (options.http) {

        this.host = options.http.host
        this.port = options.http.port || this.port
      }

      if (options.websocket) {

        this.updateInterval = options.websocket.updateInterval || this.updateInterval
        this.filter = options.websocket.filter
      }
    }
  }

  /**
   * The statistics server can be created and started in a single step or the
   * server can be started later in the overall startup process with additional/
   * changed options
   */

  public start = (options?: StatisticsServerOptions) => {

    this.stop()

    this.setOptions(options)

    this.createHttpServer()
    this.createWebsocketServer()
  }

  /**
   * Stop the statistics server. It can be restarted again.
   */

  public stop = () => {

    this.httpServer && this.httpServer.close()

    if (this.websocketServer) {

      this.websocketServer.clients.forEach((client) => {

        client.close()
      })

      this.websocketServer.close()
    }
  }

  /**
   * Start the Statistics server http server
   */

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
      
      this.log && this.log.info(this.httpServer.address(), `Statistics server started`)
    })

    this.httpServer.listen(this.port, this.host)
  }

  /**
   * Respond to the connections to websocket server
   */

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

      /**
       * Process timer expirations. Send out the set of statistics processed through the filters.
       */

      const processUpdate = () => {

        if (this.stats) {

          const table = this.stats.getTable()

          /**
           * If there is a filter use it. Otherwise send everything
           */

          if (this.filter && Array.isArray(this.filter) && this.filter.length) {

            const properties = Object.keys(table)
            const result = {}

            for (const property of properties) {

              /**
               * Filtering is based on matching a filter to the start of the statistics name.
               * The workerId is skipped before the match is checked
               */

              if (this.filter.find((filter) => property.substr(property.indexOf(':') + 1, filter.length) === filter)) {

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

      /**
       * Handle messages from the websocket client.
       * Client can start or stop the sending of data,
       * change the update interval or set the filters
       */

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
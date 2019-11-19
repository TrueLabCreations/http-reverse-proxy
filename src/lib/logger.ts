import http from 'http'
import net from 'net'
import WebSocket from 'ws'
import fs from 'fs'
import cluster from 'cluster'
import colors from 'colors/safe'
import { respondNotFound } from './util'
import { ClusterMessage } from './httpReverseProxy'

export interface LoggingMessage extends ClusterMessage {

  workerId: number
  type: string
  data: {}
  message: string
}


export const logLevels = [
  { level: 10, type: 'debug' },
  { level: 20, type: 'trace' },
  { level: 30, type: 'info' },
  { level: 40, type: 'warn' },
  { level: 50, type: 'error' },
  { level: 60, type: 'fatal' },
]

/**
 * Configuration options for the http server started by
 * the logging server
 */

export interface LoggingServerOptions {
  host?: string
  port?: number
  htmlFilename?: string
  logLevel?: number
}

/**
 * Class to handle the individual WebSocket connections
 */

class WebSocketClient {

  protected logLevel: number
  public ws: WebSocket

  public open = () => {

  }

  public close = () => {

    this.ws && this.ws.close()
  }

  constructor(logLevel: number, ws: WebSocket) {

    this.logLevel = logLevel
    this.ws = ws

    ws.on('open', this.open)

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

            this.open()
            break

          case 'stop':

            this.close()
            break

          case 'setLogLevel':

            this.logLevel = Number(data.logLevel)
            break

          default:

            break
        }
      }
    })

    ws.on('close', this.close)

  }

  public sendLogMessage(level: number, data: {}, message: string) {

    if (level >= this.logLevel) {

      const type = logLevels.find((testLevel) => testLevel.level >= level)

      this.ws.send(JSON.stringify({ level: type ? type.type : level, data: data, message: message }))
    }
  }
}

export class Logger {

  protected logLevel = 10
  protected host: string
  protected htmlFilename: string
  protected port: number
  protected httpServer: http.Server
  protected websocketServer: WebSocket.Server
  protected clients: WebSocketClient[] = []
  protected workerId: number

  constructor(options?: LoggingServerOptions) {

    if (cluster.isWorker) {

      this.workerId = cluster.worker.id
    }
    else {

      this.workerId = 0
    }

    if (options) {

      this.host = options.host
      this.port = options.port || 3002
      this.htmlFilename = options.htmlFilename
      this.logLevel = options.logLevel || 30

      if (this.workerId === 0 && (options.host || options.port)) {

        this.createHttpServer()
        this.createWebsocketServer()
      }
    }
  }

  /**
   * Start the Logging http server
   */

  private createHttpServer = () => {

    this.httpServer = http.createServer()

    this.httpServer.on('request',
      (req: http.IncomingMessage, res: http.ServerResponse) => {

        if (this.htmlFilename) {

          fs.readFile(this.htmlFilename, (error, data) => {

            if (!error) {

              res.write(data.toString('utf8'))
              res.end()
            }
            else {

              respondNotFound(req, res)
            }
          })
        }
        else {

          respondNotFound(req, res)
        }
      })

    this.httpServer.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: any) => {

      this.websocketServer.handleUpgrade(req, socket, head, (ws) => {

        this.websocketServer.emit('connection', ws, req)
      })
    })

    this.httpServer.on('listening', () => {

      console.log(`info: ${JSON.stringify(this.httpServer.address())} Logging server started`)
    })

    this.httpServer.listen(this.port, this.host)
  }

  /**
   * Create the websocket server
   */

  private createWebsocketServer = () => {

    this.websocketServer = new WebSocket.Server({ noServer: true })

    /**
     * Handle connections to the websocket server
     */

    this.websocketServer.on('connection', (ws: WebSocket) => {

      this.clients.push(new WebSocketClient(this.logLevel, ws))

      ws.on('close', () => {

        this.clients = this.clients.filter((client) => client.ws !== ws)
      })
    })
  }

  private log = (type: string, color: (value: string) => string, data: {} | null, message: string) => {

    const logLevel = logLevels.find((level) => level.type === type)

    if (!logLevel || logLevel.level >= this.logLevel) {

      if (cluster.isWorker) {

        process.send({

          messageType: 'logging',
          action: 'log',
          workerId: this.workerId,
          type: type,
          data: data,
          message: message

        } as LoggingMessage)
      }
      else {

        if (data) {

          console.log(color(`${type}: ${JSON.stringify({ time: new Date().toLocaleString(), ...data })}: ${message}`))
        }
        else {

          console.log(color(`${type}: ${JSON.stringify({ time: new Date().toLocaleString() })} ${message}`))
        }

        this.clients.forEach((client) => {

          client.sendLogMessage(logLevel.level, data, message)
        })
      }
    }
  }

  public debug(data: {} | null, message: string) {

    this.log('debug', colors.blue, data, message)
  }

  public trace(data: {} | null, message: string) {

    this.log('trace', colors.green, data, message)
  }

  public info(data: {} | null, message: string) {

    this.log('info', colors.white, data, message)
  }

  public warn(data: {} | null, message: string) {

    this.log('warn', colors.yellow, data, message)
  }

  public error(data: {} | null, message: string) {

    this.log('error', colors.red, data, message)
  }

  public fatal(data: {} | null, message: string) {

    this.log('fatal', colors.bgRed, data, message)
  }

  public processMessage = (message: LoggingMessage) => {

    switch (message.action) {

      case 'log':

        if (cluster.isMaster) {

          try {

            this[message.type](message.data, message.message)
          }
          catch (e) {
            
            this.fatal(message, 'Unknown remote message type')
          }
        }

        break

      default:

        break
    }
  }

  public close = () => {

    this.httpServer && this.httpServer.close()

    this.clients.forEach((client) => {

      client.close()
    })

    this.websocketServer && this.websocketServer.close()
  }
}

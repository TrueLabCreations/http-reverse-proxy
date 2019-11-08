import http from 'http'

export class SimpleHttpServer {

  private serverNumber: number
  private port: number
  private server: http.Server

  constructor(serverNumber: number, port: number) {
  
    this.serverNumber = serverNumber
    this.port = port
  }

  public start = () => {
  
    this.server = http.createServer((req, res) => {
  
      console.log(`Processing request for server ${this.serverNumber}`)
  
      res.write(`<html><head></head><body><h1>Hello from server ${this.serverNumber}</h1><h2>Host: ${req.headers.host}</h2><h2>Url: ${req.url}</h2></body></html>`)
      res.end()
    })
      .listen(this.port, () => {
  
        console.log(`Server ${this.serverNumber} started on port ${this.port}`)
      })
  }

  public stop = () =>{
  
    this.server && this.server.close()
  }
}
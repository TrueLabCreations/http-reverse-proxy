import http from 'http'
import app from 'express'

const server = http.createServer((req, res) => {
  console.log('Processing request for server 1')
  console.log(req.headers)
  res.write('<html><head></head><body><h1>Hello from server 1</h1></body></html>')
  res.end()
})
  .listen(8001, () => {
    console.log('Server1 started on port 8001')
  }) 
import http from 'http'

const server = http.createServer((req, res) => {
  console.log('Processing request for server 2')
  console.log(req.headers)
  res.write('<html><head></head><body><h1>Hello from server 2</h1></body></html>')
  res.end()
})
  .listen(8002, () => {
    console.log('Server2 started on port 8002')
  }) 
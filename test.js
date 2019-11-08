const Proxy = require("./dist/index");

new Proxy.SimpleHttpServer(1, 8001).start();
new Proxy.SimpleHttpServer(2, 8002).start();

new Proxy.HttpReverseProxy({log:new Proxy.SimpleLogger()})
  .addRoute("server1.test.com", "localhost:8001")
  .addRoute("server2.test.com", "localhost:8002");

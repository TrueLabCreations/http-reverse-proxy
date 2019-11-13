import { startProxy, stopProxy } from './blackboxProxy'
import { startServers, stopServers } from './blackboxServers'
import { runHttpTests, runWebsocketTests, sendRandoms } from './blackboxClients'

const runAll = async (httpIterations: number, websocketIterations: number, stringSize: number = 500): Promise<boolean> => {

  startServers()
  startProxy()

  const status = await sendRandoms(stringSize)

  if (status !== 'OK') {

    stopProxy()
    stopServers()

    return false
  }

  await Promise.all([
    runHttpTests(httpIterations),
    runWebsocketTests(websocketIterations),
  ])

  // Wait for the Proxy server statistics to propagate

  await new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 2000)
  })

  stopProxy()
  stopServers()

  return true
}

if (process.argv.length > 2) {

  const iterations1 = process.argv.length > 3 ? Number(process.argv[3]) : 500
  const iterations2 = process.argv.length > 4 ? Number(process.argv[4]) : 0

  switch (process.argv[2]) {

    case 'http':

      console.log('Starting Http clients')

      sendRandoms(100)
      runHttpTests(iterations1)
      break

    case 'ws':

      console.log('Starting Websocket clients')

      sendRandoms(100)
      runWebsocketTests(iterations1)
      break

    case 'servers':

      console.log('Starting servers')

      startServers()
      break

    case 'proxy':

      console.log('Starting proxy')

      startProxy()
      break

    case 'all':
      console.log('Starting all components')

      runAll(iterations1, iterations2)

      break;

    default:

      console.log('usage: node blackboxTests.js all [httpIterations [websocketIterations]] | http [iterations] | web [iterations] | servers  | proxy')
      break
  }
}
else {

  console.log('usage: node blackboxTests.js all [httpIterations [websocketIterations]] | http [iterations] | web [iterations] | servers  | proxy')
}


/**
 * HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
 *
 * TcpTimedWaitDelay=30
 */
import { startProxy, stopProxy } from './blackboxProxy'
import { startServers, stopServers } from './blackboxServers'
import { runHttpTests, runWebsocketTests, sendRandoms } from './blackboxCilents'

const runTests = async (httpIterations: number, websocketIterations: number, stringSize: number = 500): Promise<boolean> => {

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

runTests(500, 0)

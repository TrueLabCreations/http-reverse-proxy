import http from 'http'
import URL, { parse as urlParse } from 'url'

export interface ProxyUrl extends URL.Url {
  useTargetHostHeader?: boolean
  secure?: boolean
}

export const makeUrl = (url: string | ProxyUrl): ProxyUrl => {

  if ("object" === typeof url) {
    url = Object.assign({}, url)
  }
  else {

    if ('string' === typeof url) {
      url = urlParse(prependHttpIfRequired(url))
    }
  }

  if (url && url.protocol && url.host) {
    url.host = url.host.toLowerCase()

    if (!url.pathname) {
      url.pathname = '/'
    }

    url.pathname = url.pathname.toLowerCase()

    return url
  }

  return null
}

export const prependHttpIfRequired = (link: string): string => {

  if (link.search(/^http[s]?\:\/\//i) === -1) {
    link = 'http://' + link;
  }

  return link;
}

export const startsWith = (input: string, str: string): boolean => {

  return input.slice(0, str.length) === str &&
    (input.length === str.length || input[str.length] === '/')
}

export const respondNotFound = (req: http.IncomingMessage, res: http.ServerResponse) => {

  res.statusCode = 404
  res.write('HTTP/1.1 404 Not Found');
  res.end()
}

const ONE_DAY = 24 * 60 * 60 * 1000

/**
 * The timeout in node is only good for about 24 days.
 * 
 * Certificates routinely expire over the span of months.
 * 
 * The long timeout fires internally once a day until the last
 * day and then fires the external callback when the time has finally
 * expired
 */

export class LongTimeout {

  private expiration: number
  private timer: NodeJS.Timeout
  private callbackArgs: any[]
  private callback: (...args: any[]) => void

  constructor(callback: (...args: any[]) => void, expiration: number | Date, ...callbackArgs: any[]) {

    this.expiration = (expiration instanceof Date)
      ? expiration.valueOf()
      : Date.now() + expiration

    this.callbackArgs = callbackArgs
    this.callback = callback

    this.setTimer()
  }

  private timerFired = () => {

    this.clearTimer()

    if (this.expiration <= Date.now()) {

      this.callback(...this.callbackArgs)
    }
    else {

      this.setTimer()
    }
  }

  private setTimer = () => {

    this.clearTimer()

    const interval = this.expiration - Date.now()
    this.timer = setTimeout(this.timerFired, interval >= ONE_DAY ? ONE_DAY : interval)
  }

  clearTimer = () => {

    if (this.timer) {

      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export const setLongTimeout = (callback: (...args: any[]) => void, expiration: number | Date): LongTimeout => {

  return new LongTimeout(callback, expiration)
}

export const clearLongTimeout = (timeout: LongTimeout) => {

  timeout && timeout.clearTimer()
}

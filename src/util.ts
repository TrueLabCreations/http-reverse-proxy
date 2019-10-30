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
  res.write('Not Found');
  res.end()
};

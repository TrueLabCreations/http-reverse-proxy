type LogInterface = (data: Object, message: string) => void;

export interface LoggerInterface {
  debug: LogInterface
  trace: LogInterface
  info: LogInterface
  warn: LogInterface
  error: LogInterface
  fatal: LogInterface
  [property: string]: any
}

const log = (data: {} | null, message: string) => {
  if (data) {
    console.log(`${JSON.stringify(data)}: ${message}`)
  }
  console.log(message)
}

const simpleLogger: LoggerInterface = {
  debug: (data: {} | null, message: string) => {
    log(data, message)
  },
  trace: (data: {} | null, message: string) => {
    log(data, message)
  },
  info: (data: {} | null, message: string) => {
    log(data, message)
  },
  warn: (data: {} | null, message: string) => {
    log(data, message)
  },
  error: (data: {} | null, message: string) => {
    log(data, message)
  },
  fatal: (data: {} | null, message: string) => {
    log(data, message)
  }
}

export default simpleLogger
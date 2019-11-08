// type LogInterface = (data: Object, message: string) => void;

// export interface LoggerInterface {
//   debug: LogInterface
//   trace: LogInterface
//   info: LogInterface
//   warn: LogInterface
//   error: LogInterface
//   fatal: LogInterface
//   [property: string]: any
// }

const log = (data: {} | null, message: string) => {
  if (data) {
    console.log(`${JSON.stringify(data)}: ${message}`)
  }
  else {
    console.log(message)
  }
}

export class SimpleLogger {

  public debug(data: {} | null, message: string) {
    log(data, message)
  }

  public trace(data: {} | null, message: string) {
    log(data, message)
  }

  public info(data: {} | null, message: string) {
    log(data, message)
  }

  public warn(data: {} | null, message: string) {
    log(data, message)
  }

  public error(data: {} | null, message: string) {
    log(data, message)
  }

  public fatal(data: {} | null, message: string) {
    log(data, message)
  }
}

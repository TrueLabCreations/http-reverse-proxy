import colors from 'colors/safe'

const log = (type: string, color: (value:string) => string, data: {} | null, message: string) => {
  if (data) {
    console.log(color(`${type}: ${JSON.stringify(data)}: ${message}`))
  }
  else {
    console.log(color (`${type}: ${message}`))
  }
}

export class SimpleLogger {

  public debug(data: {} | null, message: string) {
    log('debug', colors.blue, data, message)
  }

  public trace(data: {} | null, message: string) {
    log('trace', colors.green, data, message)
  }

  public info(data: {} | null, message: string) {
    log('info', colors.white, data, message)
  }

  public warn(data: {} | null, message: string) {
    log('warn', colors.yellow, data, message)
  }

  public error(data: {} | null, message: string) {
    log('debug', colors.red, data, message)
  }

  public fatal(data: {} | null, message: string) {
    log('debug', colors.bgRed, data, message)
  }
}

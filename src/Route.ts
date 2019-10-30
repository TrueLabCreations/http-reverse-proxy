import { ProxyUrl, makeUrl } from "./util"
import { LoggerInterface } from "./simpleLogger"
import { RouteRegistrationOptions } from "./httpRouter"

export default class Route {
  public path: string
  protected roundRobin: number
  public targets: ProxyUrl[]
  protected log: LoggerInterface

  constructor(path: string, log?: LoggerInterface) {
    this.path = path
    this.log = log
    this.roundRobin = 0
    this.targets = []
  }

  public nextTarget = (): ProxyUrl => {

    if (this.noTargets()) {
      return null
    }

    const j = this.roundRobin;
    this.roundRobin = (j + 1) % this.targets.length; // get and update Round-robin index.
    return this.targets[j];
  }

  public noTargets = () => {
    return this.targets.length === 0
  }

  public addTargets = (
    targets: string | ProxyUrl | (string | ProxyUrl)[],
    options: RouteRegistrationOptions): Route => {

    if (!Array.isArray(targets)) {

      targets = [targets]
    }

    targets.forEach((value) => {

      const target = makeUrl(value)

      if (target && !this.targets.find((value) => value.href === target.href)) {

        if ('undefined' !== typeof options.secureOutbound) {
          target.secure = options.secureOutbound
        }
        else {
          target.secure = target.protocol === 'https:'
        }

        target.useTargetHostHeader = options.useTargetHostHeader || false

        this.targets.push(target);
      }
    })

    return this
  }

  public removeTargets = (targets?: string | ProxyUrl | (string | ProxyUrl)[]): Route => {

    if (targets) {
      if (!Array.isArray(targets))
        targets = [targets]

      if (targets.length) {

        targets.forEach((target) => {
          this.targets = this.targets.filter((value) => !(target = makeUrl(target)) || value.href !== target.href)
        })
      }
    }
    else {

      this.removeAllTargets();
    }

    return this
  }

  public removeAllTargets = () => {

    this.targets = []

    return this
  }

}
import { ProxyUrl, makeUrl } from "./util"
import { LoggerInterface } from "./simpleLogger"
import { RouteRegistrationOptions } from "./httpRouter"
import Statistics from "./statistics"

export default class Route {

  public path: string
  protected roundRobin: number
  public targets: ProxyUrl[]
  protected log: LoggerInterface
  protected stats: Statistics

  constructor(path: string, log?: LoggerInterface, stats?: Statistics) {

    this.path = path
    this.log = log
    this.stats = stats
    this.roundRobin = 0
    this.targets = []
  }

  public nextTarget = (): ProxyUrl => {

    if (this.noTargets()) {

      return null
    }

    return this.targets[this.roundRobin = (this.roundRobin + 1) % this.targets.length];
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

        this.stats && this.stats.updateCount('ActiveTargets', 1)
        this.stats && this.stats.updateCount('TargetsAdded', 1)
      }
    })

    return this
  }

  public removeTargets = (targets?: string | ProxyUrl | (string | ProxyUrl)[]): Route => {

    if (targets) {

      if (!Array.isArray(targets)) {

        targets = [targets]
      }

      if (targets.length) {

        const hrefs = targets.map((target) => (target = makeUrl(target)) && target.href).filter((href) => !!href)

        const count = this.targets.length

        this.targets = this.targets.filter((value) => hrefs.indexOf(value.href) < 0)

        this.stats && this.stats.updateCount('ActiveTargets', this.targets.length - count)
        this.stats && this.stats.updateCount('TargetsRemoved', count - this.targets.length)
      }
    }
    else {

      this.removeAllTargets();
    }

    return this
  }

  public removeAllTargets = () => {

    this.stats && this.stats.updateCount('ActiveTargets', -this.targets.length)
    this.stats && this.stats.updateCount('TargetsRemoved', this.targets.length)

    this.targets = []

    return this
  }

}
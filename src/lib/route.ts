import { ProxyUrl, makeUrl } from "./util"
import { SimpleLogger } from "../examples/simpleLogger"
import { RouteRegistrationOptions } from "./httpRouter"
import { Statistics } from "./statistics"

/**
 * The base Route class.
 * 
 * A Route holds an inbound path (the url part of the addRoute from)
 * and a list of targets
 */

export class Route {

  public path: string
  protected roundRobin: number
  public targets: ProxyUrl[]
  protected log: SimpleLogger
  protected stats: Statistics

  /**
   * At a minimum a Route has the inbound path '/'
   */

  constructor(path: string, log?: SimpleLogger, stats?: Statistics) {

    this.path = path
    this.log = log
    this.stats = stats
    this.roundRobin = 0
    this.targets = []
  }

  /**
   * For routes with multiple targets we return targets ina round robin manner
   */

  public nextTarget = (): ProxyUrl => {

    if (this.noTargets()) {

      return null
    }

    /**
     * The first time through this will skip the first entry.
     * Doing it this way assures that the round robin index has not walked
     * off of the array of targets due to a target being removed
     */

    return this.targets[this.roundRobin = (this.roundRobin + 1) % this.targets.length];
  }

  /**
   * Helper method to determine an empty target table
   */

  public noTargets = () => {
    return this.targets.length === 0
  }

  /**
   * Add target(s) to the route
   */

  public addTargets = (
    targets: string | ProxyUrl | (string | ProxyUrl)[],
    options: RouteRegistrationOptions): Route => {

    if (!Array.isArray(targets)) {

      targets = [targets]
    }

    /**
     * Step through the list of targets to add
     */

    targets.forEach((value) => {

      const target = makeUrl(value)

      /**
       * Make sure we have a target and that it is not already in the list
       */

      if (target && !this.targets.find((value) => value.href === target.href)) {

        /**
         * Set the outbound options for this target
         */

        if ('undefined' !== typeof options.secureOutbound) {

          target.secure = options.secureOutbound
        }
        else {

          target.secure = target.protocol === 'https:'
        }

        target.useTargetHostHeader = options.useTargetHostHeader || false

        /**
         * Add the target
         */

        this.targets.push(target);

        this.stats && this.stats.updateCount('ActiveTargets', 1)
        this.stats && this.stats.updateCount('TargetsAdded', 1)
      }
    })

    return this
  }

  /**
   * Remove target(s) from the Route
   */

  public removeTargets = (targets?: string | ProxyUrl | (string | ProxyUrl)[]): Route => {

    /**
     * A null target removes all targets
     */

    if (targets) {

      if (!Array.isArray(targets)) {
        targets = [targets]
      }

      if (targets.length) {

        /**
         * Create hrefs for all of the targets to remove
         * This saves looping through the targets to remove and the targets in the Route
         */

        const hrefs = targets.map((target) => (target = makeUrl(target)) && target.href).filter((href) => !!href)

        /**
         * Just used for updating Statistics
         */

        const count = this.targets.length

        /**
         * Filter out any target in the route that is also in the hrefs (targets to remove)
         */

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

  /**
   * Clear all of the targets on the Route
   */

  public removeAllTargets = () => {

    this.stats && this.stats.updateCount('ActiveTargets', -this.targets.length)
    this.stats && this.stats.updateCount('TargetsRemoved', this.targets.length)

    this.targets = []

    return this
  }

}
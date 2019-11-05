import cluster from 'cluster'
import { ClusterMessage } from './httpReverseProxy'

export interface StatisticsMessage extends ClusterMessage {

  name?: string
  count?: number
}

export type StatisticsTable = {

  [name: string]: number
}

export default class Statistics {

  protected statTable: StatisticsTable

  constructor() {

    this.statTable = {}
  }

  public updateCount = (name: string, count: number) => {

    if (!name) {

      return
    }

    if (cluster.isWorker) {

      process.send({

        messageType: 'statistics',
        action: 'updateCount',
        name: name,
        count: count

      } as StatisticsMessage)
    }
    else {

      const entry = this.statTable[name]

      if (!entry) {

        this.statTable[name] = count
      }
      else {

        this.statTable[name] += count
      }
    }
  }

  public getTable = (): StatisticsTable => {

    return { ...this.statTable }
  }

  public getCount = (name: string): number => {

    if (name && this.statTable[name]) {

      return this.statTable[name]
    }

    return 0
  }

  public clearCounts = () => {

    for (const name in this.statTable) {

      this.statTable[name] = 0
    }
  }

  public clearCount = (name: string) => {

    if (name && this.statTable[name]) {

      this.statTable[name] = 0
    }
  }

  public processMessage = (message: StatisticsMessage) => {

    switch (message.action) {

      case 'updateCount':

        if (cluster.isMaster) {

          this.updateCount(message.name, message.count)
        }

        break

      default:

        break
    }
  }
}

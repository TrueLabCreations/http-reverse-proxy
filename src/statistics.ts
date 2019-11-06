import cluster from 'cluster'
import { ClusterMessage } from './httpReverseProxy'

export interface StatisticsMessage extends ClusterMessage {

  workerId: number
  name: string
  count: number
}

export type StatisticsTable = {

  [name: string]: number
}

export default class Statistics {

  protected workerId: number
  protected statTable: StatisticsTable

  constructor() {

    this.statTable = {}

    if (cluster.isWorker){

      this.workerId = cluster.worker.id
    }
    else{

      this.workerId = 0
    }
  }

  public updateCount = (name: string, count: number,workerId: number = this.workerId) => {

    if (!name) {

      return
    }

    if (cluster.isWorker) {

      process.send({

        messageType: 'statistics',
        action: 'updateCount',
        workerId: this.workerId,
        name: name,
        count: count

      } as StatisticsMessage)
    }
    else {

      const entry = this.statTable[`${workerId}:${name}`]

      if (!entry) {

        this.statTable[`${workerId}:${name}`] = count
      }
      else {

        this.statTable[`${workerId}:${name}`] += count
      }
    }
  }

  public getTable = (): StatisticsTable => {

    return { ...this.statTable }
  }

  public getCount = (name: string, workerId:number = this.workerId): number => {

    if (name && this.statTable[`${workerId}:${name}`]) {

      return this.statTable[`${workerId}:${name}`]
    }

    return 0
  }

  public clearCounts = () => {

    for (const name in this.statTable) {

      this.statTable[name] = 0
    }
  }

  public clearCount = (name: string, workerId:number = this.workerId) => {

    if (name && this.statTable[`${workerId}:${name}`]) {

      this.statTable[`${workerId}:${name}`] = 0
    }
  }

  public processMessage = (message: StatisticsMessage) => {

    switch (message.action) {

      case 'updateCount':

        if (cluster.isMaster) {

          this.updateCount(message.name, message.count, message.workerId)
        }

        break

      default:

        break
    }
  }
}

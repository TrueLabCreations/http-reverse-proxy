
export type StatisticsTable = {

  [name: string]: number
}

export default class Statistics {

  protected statTable: StatisticsTable

  constructor() {

    this.statTable = {}
  }

  public updateCount = (name: string, count: number) => {

    const entry = this.statTable[name]

    if (!entry) {

      this.statTable[name] = count
    }
    else {

      this.statTable[name] += count
    }
  }

  public getTable = (): StatisticsTable => {

    return { ...this.statTable }
  }

  public getCount = (name: string): number => {

    if (this.statTable[name]) {

      return this.statTable[name]
    }

    return 0
  }

  public clearCounts = () =>{

    for (const name in this.statTable){

      this.statTable[name] = 0
    }
  }

  public clearCount = (name: string) =>{

    if ( this.statTable[name]){

      this.statTable[name] = 0
    }
  }
}

import { Gulpclass, Task } from 'gulpclass'

@Gulpclass()
export class Gulpfile {

  @Task()
  default(cb) {

    // place code for your default task here
    cb();
  }
}

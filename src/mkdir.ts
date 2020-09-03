import { mkdir } from "fs-extra";
import { parse } from "path";
import { UnaryFunction } from "rxjs";

export function createMkdirp(): UnaryFunction<string, Promise<string>> {
  const dirs: Record<string, Promise<string>> = {};

  function makeDir(name: string): Promise<string> {
    const running$ = dirs[name];
    if (running$) {
      return running$;
    }
    // log  this
    console.log("creating directory", name);
    // split
    const { dir, root } = parse(name);
    const new$ = dir === root ? mkdir(name) : makeDir(dir).then(mkdir);
    // register
    const toName = () => name;
    return (dirs[name] = new$.then(toName, toName));
  }

  return makeDir;
}

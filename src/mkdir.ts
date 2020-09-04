import { mkdir } from 'fs-extra';
import { parse } from 'path';
import { bindNodeCallback, from, Observable, of, UnaryFunction } from 'rxjs';
import { catchError, mapTo, mergeMapTo } from 'rxjs/operators';

const rxMkDir = bindNodeCallback(mkdir);

export function createMkdirp(): UnaryFunction<string, Observable<string>> {
  const dirs: Record<string, Promise<string>> = {};

  function makeDir(name: string): Observable<string> {
    const running$ = dirs[name];
    if (running$) {
      return from(running$);
    }
    // split
    const { dir, root } = parse(name);
    const new$ =
      dir === root
        ? rxMkDir(name)
        : makeDir(dir).pipe(mergeMapTo(rxMkDir(name)));
    const dir$ = new$.pipe(
      mapTo(name),
      catchError(() => of(name))
    );
    // register
    return from((dirs[name] = dir$.toPromise()));
  }
  // returns the generator
  return makeDir;
}

import {
  Observable,
  from,
  combineLatest,
  bindNodeCallback,
  UnaryFunction,
  MonoTypeOperatorFunction,
  EMPTY,
  defer,
  merge,
} from "rxjs";
import { createMkdirp } from "./mkdir";
import { mergeMap, map, mapTo } from "rxjs/operators";
import { copyFile, stat, readdir, read, Stats, move, copy } from "fs-extra";
import { join } from "path";

const rxReadDir = bindNodeCallback<string, string[]>(readdir);
const rxStats = bindNodeCallback<string, Stats>(stat);
const rxCopyFile = bindNodeCallback(copyFile);

const cmpStrings = (left: string, right: string): number =>
  left.localeCompare(right);

const isSame = (left: Stats, right: Stats): boolean =>
  left.size === right.size && left.mtime === right.mtime;

function doSync(
  src: string,
  dst: string,
  bkg: string,
  mkdirp: UnaryFunction<string, Promise<string>>
): Observable<string[]> {
  function copyDeep(rel: string[]): Observable<string[]> {
    return EMPTY;
  }

  function copyFlat(rel: string[]): Observable<string[]> {
    return rxCopyFile(join(src, ...rel), join(dst, ...rel)).pipe(mapTo(rel));
  }

  function copy(bFile: boolean, rel: string[]): Observable<string[]> {
    return (bFile ? copyFlat : copyDeep)(rel);
  }

  function backup(rel: string[]): Observable<string[]> {
    return defer(() => move(join(dst, ...rel), join(bkg, ...rel))).pipe(
      mapTo(rel)
    );
  }

  function syncNew(rel: string[]): Observable<string[]> {
    return rxStats(join(src, ...rel)).pipe(
      mergeMap((stat) => copy(stat.isFile(), rel))
    );
  }

  function syncSingle(rel: string[]): Observable<string[]> {
    // check if we need to recurse
    const statL$ = rxStats(join(src, ...rel));
    const statR$ = rxStats(join(src, ...rel));
    // execute
    return combineLatest([statL$, statR$]).pipe(
      mergeMap(([statL, statR]) => {
        // we need to iterate into directories
        if (statL.isDirectory() && statR.isDirectory()) {
          // recurse
          return syncRecurse(rel);
        }
        // we need to check if files are identical
        if (statL.isFile() && statR.isFile() && isSame(statL, statR)) {
          return EMPTY;
        }
        // copy source to target location
        return backup(rel).pipe(mergeMap(() => copy(statL.isFile(), rel)));
      })
    );
  }

  function syncChildren(
    rel: string[],
    left: string[],
    right: string[]
  ): Observable<string[]> {
    // sort the list
    const l = [...left].sort(cmpStrings);
    const r = [...right].sort(cmpStrings);
    // target observables
    const result: Array<Observable<string[]>> = [];
    // indexes
    let idxL = 0;
    let idxR = 0;
    const lenL = l.length;
    const lenR = r.length;
    // walk in parallel
    while (idxL < lenL && idxR < lenR) {
      // names
      const nameL = l[idxL];
      const nameR = r[idxR];
      // handle
      const c = cmpStrings(nameL, nameR);
      if (c === 0) {
        // register
        result.push(syncSingle([...rel, nameL]));
        // advance both indexes
        idxL++;
        idxR++;
      } else if (c < 0) {
        // src is new, just copy
        result.push(syncNew([...rel, nameL]));
        idxL++;
      } else {
        // dst is extra, move it
        result.push(backup([...rel, nameR]));
        idxR++;
      }
    }
    // handle extra source
    while (idxL < lenL) {
      result.push(syncNew([...rel, l[idxL++]]));
    }
    // handle extra target
    while (idxR < lenR) {
      result.push(backup([...rel, r[idxR++]]));
    }
    // combine all
    return result.length == 0 ? EMPTY : merge(...result);
  }

  function syncRecurse(rel: string[]): Observable<string[]> {
    // list
    console.log("sync recurse", rel);
    // combine
    return combineLatest([
      rxReadDir(join(src, ...rel)),
      rxReadDir(join(dst, ...rel)),
    ]).pipe(mergeMap(([left, right]) => syncChildren(rel, left, right)));
  }
  // start with the root folder
  return syncRecurse([]);
}

export function sync(
  src: string,
  dst: string,
  bkg: string
): Observable<string[]> {
  // make sure to create the directories
  const mkdirp = createMkdirp();
  // make sure we have the directories
  const src$ = from(mkdirp(src));
  const dst$ = from(mkdirp(dst));
  const bkg$ = from(mkdirp(bkg));
  // sync
  return combineLatest([src$, dst$, bkg$]).pipe(
    mergeMap(([s, d, b]) => doSync(s, d, b, mkdirp))
  );
}

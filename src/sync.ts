import { copyFile, mkdir, readdir, rename, stat, Stats } from "graceful-fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  bindNodeCallback,
  combineLatest,
  EMPTY,
  from,
  merge,
  Observable,
  UnaryFunction,
} from "rxjs";
import { catchError, mapTo, mergeMap, mergeMapTo } from "rxjs/operators";
import { createMkdirp } from "./mkdir";
import { latestRootDir, newRootDir } from "./root";

const rxReadDir = bindNodeCallback<string, string[]>(readdir);
const rxStats = bindNodeCallback<string, Stats>(stat);
const rxCopyFile = bindNodeCallback(copyFile);
const rxRename = bindNodeCallback(rename);
const rxMkdir = bindNodeCallback(mkdir);

export type Path = string[];

const cmpStrings = (left: string, right: string): number =>
  left.localeCompare(right);

const isCurrent = (left: Stats, right: Stats): boolean =>
  left.size === right.size && left.mtime <= right.mtime;

function doSync(
  src: string,
  dst: string,
  bkg: string,
  mkdirp: UnaryFunction<string, Observable<string>>
): Observable<Path> {
  const copyDeep = (rel: Path): Observable<Path> =>
    rxReadDir(join(src, ...rel)).pipe(
      mergeMap((children) => from(children)),
      mergeMap((child) =>
        rxStats(join(src, ...rel, child)).pipe(
          mergeMap((childStats) =>
            childStats.isDirectory()
              ? rxMkdir(join(dst, ...rel, child)).pipe(
                  mergeMapTo(copyDeep([...rel, child]))
                )
              : childStats.isFile()
              ? copyFlat([...rel, child])
              : EMPTY
          )
        )
      )
    );

  const copyFlat = (rel: Path): Observable<Path> =>
    rxCopyFile(join(src, ...rel), join(dst, ...rel)).pipe(mapTo(rel));

  const copy = (bFile: boolean, rel: Path): Observable<Path> =>
    bFile
      ? copyFlat(rel)
      : rxMkdir(join(dst, ...rel)).pipe(mergeMapTo(copyDeep(rel)));

  const backup = (rel: Path): Observable<Path> =>
    mkdirp(join(bkg, ...rel.slice(0, -1))).pipe(
      mergeMap(() => rxRename(join(dst, ...rel), join(bkg, ...rel))),
      mapTo(rel)
    );

  const syncNew = (rel: Path): Observable<Path> =>
    rxStats(join(src, ...rel)).pipe(
      mergeMap((stat) => copy(stat.isFile(), rel))
    );

  function syncSingle(rel: Path): Observable<Path> {
    // check if we need to recurse
    const statL$ = rxStats(join(src, ...rel));
    const statR$ = rxStats(join(dst, ...rel));
    // execute
    return combineLatest([statL$, statR$]).pipe(
      mergeMap(([statL, statR]) => {
        // we need to iterate into directories
        if (statL.isDirectory() && statR.isDirectory()) {
          // recurse
          return syncRecurse(rel);
        }
        // we need to check if files are identical
        if (statL.isFile() && statR.isFile() && isCurrent(statL, statR)) {
          return EMPTY;
        }
        // copy source to target location
        return backup(rel).pipe(mergeMap(() => copy(statL.isFile(), rel)));
      })
    );
  }

  function syncChildren(
    rel: Path,
    left: string[],
    right: string[]
  ): Observable<Path> {
    // sort the list
    const l = [...left].sort(cmpStrings);
    const r = [...right].sort(cmpStrings);
    // target observables
    const result: Array<Observable<Path>> = [];
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

  function syncRecurse(rel: Path): Observable<Path> {
    // combine
    return combineLatest([
      rxReadDir(join(src, ...rel)),
      rxReadDir(join(dst, ...rel)),
    ]).pipe(mergeMap(([left, right]) => syncChildren(rel, left, right)));
  }
  // start with the root folder
  return syncRecurse([]);
}

const internalSync = (
  src: string,
  dst: string,
  bkg: string,
  mkdirp: UnaryFunction<string, Observable<string>>
): Observable<Path> =>
  combineLatest([mkdirp(src), mkdirp(dst), mkdirp(bkg)]).pipe(
    mergeMap(([s, d, b]) => doSync(s, d, b, mkdirp))
  );

export function sync(src: string, root: string): Observable<Path> {
  // make sure to create the directories
  const mkdirp = createMkdirp();
  const newName = newRootDir();
  const dst = join(root, newName);
  // ensure the target folder
  return mkdirp(root).pipe(
    mergeMap(latestRootDir),
    mergeMap((lastName) => {
      // rename the old directory to a new one
      const bkg = join(root, lastName);
      // rename
      return rxRename(bkg, dst).pipe(
        mergeMap(() => internalSync(src, dst, bkg, mkdirp))
      );
    }),
    catchError((err) => internalSync(src, dst, tmpdir(), mkdirp))
  );
}

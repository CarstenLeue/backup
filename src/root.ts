import { readdir } from "fs-extra";
import { bindNodeCallback, EMPTY, from, empty } from "rxjs";
import { map, catchError, mergeMap, toArray, first, tap } from "rxjs/operators";
import { join } from "path";

/** Scripts to handle root level folders */

const rxReadDir = bindNodeCallback(readdir);

function cmpTuple([nameLeft, dateLeft], [nameRight, dateRight]) {
  return dateLeft < dateRight ? +1 : dateLeft > dateRight ? -1 : 0;
}

const toFolderName = (date: Date): string =>
  date.toISOString().replace(/\:/g, "_");

const fromFolderName = (name: string): Date =>
  new Date(name.replace(/_/g, ":"));

export const newRootDir = (rootFolder: string) =>
  join(rootFolder, toFolderName(new Date()));

export const latestRootDir = (rootFolder: string) =>
  rxReadDir(rootFolder).pipe(
    mergeMap((names) => from(names)),
    tap(console.log),
    map((name) => [name, fromFolderName(name).getTime()]),
    catchError(empty),
    toArray(),
    map((all) => all.sort(cmpTuple)),
    mergeMap((all) => from(all)),
    first(),
    map(([name]) => name),
    map((name) => join(rootFolder, name))
  );

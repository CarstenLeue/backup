import { readdir } from "graceful-fs";
import { bindNodeCallback, Observable } from "rxjs";
import { map } from "rxjs/operators";

/** Scripts to handle root level folders */

const rxReadDir = bindNodeCallback<string, string[]>(readdir);

function cmpTuple([nameLeft, dateLeft], [nameRight, dateRight]) {
  return dateLeft < dateRight ? +1 : dateLeft > dateRight ? -1 : 0;
}

const toFolderName = (date: Date): string =>
  date.toISOString().replace(/\:/g, "_");

const fromFolderName = (name: string): Date =>
  new Date(name.replace(/_/g, ":"));

export const newRootDir = () => toFolderName(new Date());

const makePair = (name: string, date: number): [string, number] => [name, date];

export const latestRootDir = (rootFolder: string): Observable<string> =>
  rxReadDir(rootFolder).pipe(
    map((names) =>
      names
        .map((name) => makePair(name, fromFolderName(name).getTime()))
        .filter(([name, date]) => !Number.isNaN(date))
    ),
    map((tuples) => tuples.sort(cmpTuple)),
    map(([[name]]) => name)
  );

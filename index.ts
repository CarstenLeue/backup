import { argv } from "process";
import { sync } from "./src/sync";
import { map } from "rxjs/operators";
import { join } from "path";

const [driver, script, src, dst] = argv;
const sync$ = sync(src, dst)
  .pipe(map((rel) => join(...rel)))
  .subscribe(console.log, console.error);

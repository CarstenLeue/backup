import { argv } from "process";
import { sync } from "./src/sync";

const [driver, script, src, dst] = argv;
const sync$ = sync(src, dst).subscribe(console.log, console.error);

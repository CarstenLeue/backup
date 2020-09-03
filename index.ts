import { newRootDir } from "./src/root";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(tmpdir(), "backup");

console.log(newRootDir(ROOT));

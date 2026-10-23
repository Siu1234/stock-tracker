/* Test runner: executes every *.cjs test file in this folder, in order.
   Files that don't exist on this machine (e.g. local-only real-data
   assertions) are simply not run. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith(".test.cjs"))
  .sort();

let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  try {
    execFileSync(process.execPath, [path.join(dir, f)], { stdio: "inherit" });
  } catch (e) {
    failed++;
  }
}
console.log(failed ? `\n${failed} test file(s) failed` : "\nALL TEST FILES PASSED");
process.exit(failed ? 1 : 0);

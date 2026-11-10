import { spawn } from "node:child_process";
import { faults } from "./faults.js";
import { root } from "./support.js";

let failed = false;
for (const [name, fault] of Object.entries(faults)) {
  const child = spawn(process.execPath, ["tests/ui.test.js"], {
    cwd: root,
    env: { ...process.env, TEST_FAULT: name, TEST_SUITE: fault.suite },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Mutation ${name} timed out`));
    }, 120000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  const caught =
    code === 1 &&
    output.includes(`MUTATION APPLIED: ${name}`) &&
    output
      .split("\n")
      .some((line) => line.includes("FAIL") && line.includes(fault.assertion));
  console.log(`${caught ? "ok" : "FAIL"} intentional defect detected: ${name}`);
  if (!caught) {
    failed = true;
    console.error(output);
  }
}
process.exitCode = failed ? 1 : 0;

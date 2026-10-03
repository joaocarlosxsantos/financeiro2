// Roda testes, tipos e build e imprime só o resumo (ou o erro). Uso: npm run verify
import { spawnSync } from "node:child_process";

const steps = [
  ["vitest", "npx vitest run", /Tests\s+(.+)/],
  ["tsc", "npx tsc --noEmit", null],
  ["build", "npm run build", /Compiled successfully[^\n]*/],
];

let failed = false;
for (const [name, cmd, okRe] of steps) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status === 0) {
    const hit = okRe ? out.match(okRe) : null;
    console.log(`OK   ${name}${hit ? ` — ${(hit[1] ?? hit[0]).trim()}` : ""}`);
  } else {
    failed = true;
    console.log(`FAIL ${name}`);
    const lines = out.split("\n").filter((l) => /error|fail|×|Error|✗|expected/i.test(l));
    console.log((lines.length ? lines : out.split("\n")).slice(-40).join("\n"));
    break; // o primeiro erro basta; corrija e rode de novo
  }
}
process.exit(failed ? 1 : 0);

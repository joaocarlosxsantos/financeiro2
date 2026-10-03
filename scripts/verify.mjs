// Roda testes, tipos e build e imprime só o resumo (ou o erro). Uso: npm run verify
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

// Arquivos "use server" só podem exportar funções async (e tipos). O `next build` NÃO pega
// isso: quebra só em runtime, na primeira chamada de qualquer action do arquivo.
const actionsDir = "src/server/actions";
const bad = [];
for (const f of readdirSync(actionsDir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
  const src = readFileSync(`${actionsDir}/${f}`, "utf8");
  if (!/^["']use server["']/m.test(src)) continue;
  for (const m of src.matchAll(/^export\s+(?:const|let|var|class|default|function)\b[^\n]*/gm)) {
    bad.push(`${f}: ${m[0].slice(0, 80)}`);
  }
}
if (bad.length) {
  console.log(`FAIL use-server (só exportar funções async):\n${bad.join("\n")}`);
  process.exit(1);
}
console.log("OK   use-server — só funções async exportadas");

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

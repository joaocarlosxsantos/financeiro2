import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Server Actions compile-time boundary guard", () => {
  it("garante que nenhum arquivo com 'use server' exporta funções ou variáveis síncronas", () => {
    const actionsDir = path.resolve(__dirname);
    const files = fs
      .readdirSync(actionsDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

    const violations: { file: string; line: string }[] = [];

    for (const file of files) {
      const filePath = path.join(actionsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Apenas arquivos com 'use server' no topo
      if (!/^\s*['"]use server['"]/m.test(content)) continue;

      const lines = content.split("\n");
      for (const line of lines) {
        // Ignora tipos e interfaces
        if (/^\s*export\s+(type|interface)\b/.test(line)) continue;

        // Se exportar função não assíncrona
        if (/^\s*export\s+function\s+\w+/.test(line)) {
          violations.push({ file, line: line.trim() });
        }

        // Se exportar const/let/var com valor síncrono
        if (/^\s*export\s+(const|let|var)\s+\w+\s*=/.test(line)) {
          // Permite apenas se for arrow function explicitamente async
          if (!/^\s*export\s+const\s+\w+\s*=\s*async\b/.test(line)) {
            violations.push({ file, line: line.trim() });
          }
        }
      }
    }

    expect(
      violations,
      `Arquivos com 'use server' só podem exportar funções assíncronas (Server Actions) ou tipos.\nViolações encontradas: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
});

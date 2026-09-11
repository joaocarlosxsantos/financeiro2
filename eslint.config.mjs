import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// A partir do Next.js 16, o eslint-config-next passou a exportar configs
// "flat" nativas (arrays) através desses subpaths — o padrão antigo
// (FlatCompat.extends("next/core-web-vitals", "next/typescript")) não é mais
// compatível e quebra com "Converting circular structure to JSON".
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

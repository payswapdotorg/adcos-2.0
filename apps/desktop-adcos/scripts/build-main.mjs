#!/usr/bin/env node
/**
 * build-main.mjs — bundle the Electron main + preload with esbuild.
 * The domain (workspace TS sources) is bundled in; `electron` stays
 * external. Output: out/main/index.js (ESM) + out/preload/index.js (CJS —
 * preload requires CommonJS under sandbox).
 */
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...shared,
  format: "esm",
  entryPoints: ["src/main/index.ts"],
  outfile: "out/main/index.js",
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __fu } from 'node:url';",
      "import { dirname as __dn } from 'node:path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __fu(import.meta.url);",
      "const __dirname = __dn(__filename);",
    ].join("\n"),
  },
});

await build({
  ...shared,
  format: "cjs",
  entryPoints: ["src/preload/index.ts"],
  outfile: "out/preload/index.js",
});

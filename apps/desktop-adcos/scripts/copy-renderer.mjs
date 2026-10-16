#!/usr/bin/env node
/**
 * copy-renderer.mjs — stage the built ADCOS product surface into the
 * desktop app's renderer directory. The desktop window loads ONLY these
 * local files (product lock).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("../../packages/product-web/dist");
const target = resolve("out/renderer");

if (!existsSync(source)) {
  console.error(`[copy-renderer] missing ${source} — run the product-web build first`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[copy-renderer] staged ${source} -> ${target}`);

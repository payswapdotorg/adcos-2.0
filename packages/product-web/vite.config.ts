import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * ADCOS product web build. The bundle is deliberately small: the product
 * surface imports @adcos/surfaces TYPES ONLY (the domain runtime — the real
 * SurfacesService over the durable JSONL store — lives in the desktop
 * main process, reached through the preload bridge). No @zcode/*
 * dependency exists in this package by construction.
 */
export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
});

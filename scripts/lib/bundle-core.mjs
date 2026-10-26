// Bundles packages/performance-core (TypeScript) to a temporary ESM file with
// esbuild (the same version Vite uses), so plain Node scripts can import it.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadCore() {
  const esbuild = await import("esbuild");
  const outDir = join(root, "scripts", ".tmp");
  mkdirSync(outDir, { recursive: true });
  const outfile = join(outDir, "performance-core.mjs");
  await esbuild.build({
    entryPoints: [join(root, "packages", "performance-core", "src", "index.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile,
    logLevel: "error",
    absWorkingDir: join(root, "packages", "performance-core")
  });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

export { root };

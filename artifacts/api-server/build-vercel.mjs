import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(artifactDir, "dist/vercel");

await rm(outputDir, { recursive: true, force: true });

const resolveTypeScriptJsImports = {
  name: "resolve-typescript-js-imports",
  setup(buildOptions) {
    buildOptions.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
      const sourcePath = path.resolve(
        path.dirname(args.importer),
        args.path.replace(/\.js$/, ".ts"),
      );

      if (existsSync(sourcePath)) return { path: sourcePath };
      return undefined;
    });
  },
};

await build({
  entryPoints: [path.resolve(artifactDir, "src/app.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: outputDir,
  entryNames: "app",
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  external: ["mongodb"],
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: "linked",
  plugins: [resolveTypeScriptJsImports],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
  },
});
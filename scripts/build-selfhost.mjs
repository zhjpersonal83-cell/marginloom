import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { mkdir, cp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

await rm("dist-selfhost", { recursive: true, force: true });
await viteBuild({ configFile: resolve("selfhost/vite.config.ts") });
await mkdir("dist-selfhost/server", { recursive: true });
await build({
  entryPoints: ["selfhost/server.mjs"],
  outfile: "dist-selfhost/server/server.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  alias: { "cloudflare:workers": resolve("selfhost/env.mjs") },
  tsconfig: "tsconfig.json",
  minify: false,
});
await cp("drizzle", "dist-selfhost/migrations", { recursive: true });
await cp("selfhost/backup.mjs", "dist-selfhost/server/backup.mjs");
await cp("deploy", "dist-selfhost/deploy", { recursive: true });
await cp("LICENSE", "dist-selfhost/LICENSE");
await cp("docs/self-hosting.md", "dist-selfhost/DEPLOYMENT.md");
const commit =
  process.env.MARGINLOOM_SOURCE_COMMIT ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
    .length > 0;
await writeFile(
  "dist-selfhost/build.json",
  JSON.stringify(
    {
      sourceCommit: commit,
      dirty,
      runtime: "Node.js 24 / node:sqlite",
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Self-host build ready: dist-selfhost (no node_modules required at runtime)",
);

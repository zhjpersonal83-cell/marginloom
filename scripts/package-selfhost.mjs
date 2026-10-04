import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const version = "24.21.0";
const distribution = `node-v${version}-linux-x64`;
// Published by https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
const expected =
  "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff";
const output = resolve(
  process.argv[2] || "artifacts/local/Marginloom-Ubuntu-x64.tar.gz",
);
const temporary = await mkdtemp(join(tmpdir(), "marginloom-package-"));
async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
try {
  await access("dist-selfhost/server/server.mjs");
  const archive =
    process.env.MARGINLOOM_NODE_ARCHIVE ||
    join(temporary, distribution + ".tar.gz");
  if (!process.env.MARGINLOOM_NODE_ARCHIVE)
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "2",
        "--max-time",
        "180",
        `https://nodejs.org/dist/v${version}/${distribution}.tar.gz`,
        "-o",
        archive,
      ],
      { stdio: "inherit" },
    );
  if ((await sha256(archive)) !== expected)
    throw new Error("Node distribution checksum mismatch; refusing to package");
  execFileSync("tar", [
    "--no-same-owner",
    "-xzf",
    archive,
    "-C",
    temporary,
    `${distribution}/bin/node`,
    `${distribution}/LICENSE`,
  ]);
  const extractedNode = join(temporary, distribution, "bin/node");
  // Guard against interrupted/truncated extraction, not just download corruption.
  if (
    (await sha256(extractedNode)) !==
    "7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c"
  )
    throw new Error(
      "Extracted Node executable checksum mismatch; refusing to package",
    );
  await mkdir("dist-selfhost/runtime", { recursive: true });
  await cp(
    join(temporary, distribution, "bin/node"),
    "dist-selfhost/runtime/node",
  );
  await chmod("dist-selfhost/runtime/node", 0o755);
  await cp(
    join(temporary, distribution, "LICENSE"),
    "dist-selfhost/runtime/NODE-LICENSE",
  );
  await cp(
    "docs/third-party-notices.md",
    "dist-selfhost/THIRD-PARTY-NOTICES.md",
  );
  const files = [];
  async function walk(path = "") {
    for (const entry of await readdir(join("dist-selfhost", path), {
      withFileTypes: true,
    })) {
      const relative = join(path, entry.name);
      if (entry.isDirectory()) await walk(relative);
      else if (relative !== "SHA256SUMS") files.push(relative);
    }
  }
  await walk();
  const sums = [];
  for (const file of files.sort())
    sums.push(`${await sha256(join("dist-selfhost", file))}  ${file}`);
  await writeFile("dist-selfhost/SHA256SUMS", sums.join("\n") + "\n");
  await mkdir(resolve(output, ".."), { recursive: true });
  execFileSync("tar", ["-czf", output, "-C", "dist-selfhost", "."]);
  execFileSync("gzip", ["-t", output]);
  console.log(
    JSON.stringify({
      archive: output,
      sha256: await sha256(output),
      bundledNode: version,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

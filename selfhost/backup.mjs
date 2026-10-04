import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const source =
  process.env.MARGINLOOM_DB || "/var/lib/marginloom/marginloom.sqlite";
const directory =
  process.env.MARGINLOOM_BACKUPS || "/var/lib/marginloom/backups";
await mkdir(directory, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
try {
  const destination = resolve(
    directory,
    `marginloom-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
  );
  await backup(database, destination);
  console.log("SQLite backup completed:", destination);
  const files = (await readdir(directory))
    .filter((name) => /^marginloom-.*\.sqlite$/.test(name))
    .sort()
    .reverse();
  for (const name of files.slice(3)) await unlink(resolve(directory, name));
} finally {
  database.close();
}

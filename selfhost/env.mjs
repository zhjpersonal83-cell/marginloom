import { fileURLToPath } from "node:url";
import { openDatabase } from "./sqlite.mjs";

export const env = {
  DB: openDatabase(
    process.env.MARGINLOOM_DB || "./marginloom.sqlite",
    fileURLToPath(new URL("../migrations/", import.meta.url)),
  ),
};

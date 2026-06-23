import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import initSqlJs from "sql.js";
import { env } from "../config/env.js";
import type { SqliteDatabase } from "./sqlite.js";
import { SqlJsDatabase } from "./sqlite.js";

export async function createDatabase(): Promise<SqliteDatabase> {
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file)
  });
  const data = fs.existsSync(env.databasePath) ? await fsp.readFile(env.databasePath) : undefined;
  const db = new SQL.Database(data);
  const wrapped = new SqlJsDatabase(db, env.databasePath);
  wrapped.exec("PRAGMA foreign_keys = ON");
  wrapped.persist();
  return wrapped;
}

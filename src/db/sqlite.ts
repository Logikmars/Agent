import fs from "node:fs";
import type { Database } from "sql.js";

type BindParams = unknown[] | Record<string, unknown>;

export interface SqliteDatabase {
  exec(sql: string): void;
  run(sql: string, params?: BindParams): void;
  get<T>(sql: string, params?: BindParams): T | undefined;
  all<T>(sql: string, params?: BindParams): T[];
  transaction<T>(fn: () => T): T;
  persist(): void;
}

export class SqlJsDatabase implements SqliteDatabase {
  private inTransaction = false;

  constructor(private readonly db: Database, private readonly filePath: string) {}

  exec(sql: string): void {
    this.db.exec(sql);
    if (!this.inTransaction) this.persist();
  }

  run(sql: string, params: BindParams = []): void {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalizeParams(params) as any);
      stmt.step();
    } finally {
      stmt.free();
    }
    if (!this.inTransaction) this.persist();
  }

  get<T>(sql: string, params: BindParams = []): T | undefined {
    const rows = this.all<T>(sql, params);
    return rows[0];
  }

  all<T>(sql: string, params: BindParams = []): T[] {
    const stmt = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(normalizeParams(params) as any);
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    this.inTransaction = true;
    try {
      const result = fn();
      this.inTransaction = false;
      this.db.exec("COMMIT");
      this.persist();
      return result;
    } catch (error) {
      this.inTransaction = false;
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  persist(): void {
    fs.writeFileSync(this.filePath, Buffer.from(this.db.export()));
  }
}

function normalizeParams(params: BindParams): BindParams {
  if (Array.isArray(params)) return params;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key.startsWith("@") || key.startsWith(":") || key.startsWith("$") ? key : `@${key}`] = value;
  }
  return normalized;
}

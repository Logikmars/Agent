import type { SqliteDatabase } from "../sqlite.js";
import { tokenizeSearchText, weightedTerms } from "../searchTerms.js";

export type MemoryScope = "important" | "dialog";

export type MemoryRecord = {
  id: number;
  scope: MemoryScope;
  kind: string;
  content: string;
  importance: number;
  source: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export class MemoryRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(kind: string, content: string, metadata: unknown = {}, importance = 1, source = "agent", scope?: MemoryScope): MemoryRecord {
    const now = new Date().toISOString();
    const resolvedScope = scope ?? inferScope(kind, source);
    this.db.run(`
      INSERT INTO memories (scope, kind, content, importance, source, metadata_json, created_at, updated_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `, [resolvedScope, kind, content.trim(), importance, source, JSON.stringify(metadata), now, now]);
    const record = this.db.get<MemoryRecord>("SELECT * FROM memories ORDER BY id DESC LIMIT 1");
    if (!record) throw new Error("Failed to reload created memory");
    this.replaceTerms(record);
    return record;
  }

  recent(limit = 5, scope?: MemoryScope): MemoryRecord[] {
    const filter = scope ? "WHERE scope = ?" : "";
    const params: unknown[] = scope ? [scope, limit] : [limit];
    return this.db.all<MemoryRecord>(`
      SELECT * FROM memories
      ${filter}
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `, params);
  }

  list(limit = 100, scope?: MemoryScope): MemoryRecord[] {
    const filter = scope ? "WHERE scope = ?" : "";
    const params: unknown[] = scope ? [scope, limit] : [limit];
    return this.db.all<MemoryRecord>(`
      SELECT * FROM memories
      ${filter}
      ORDER BY scope, updated_at DESC, id DESC
      LIMIT ?
    `, params);
  }

  delete(id: number): boolean {
    const found = this.db.get<MemoryRecord>("SELECT * FROM memories WHERE id = ?", [id]);
    if (!found) return false;
    this.db.transaction(() => {
      this.db.run("DELETE FROM memory_search_terms WHERE memory_id = ?", [id]);
      this.db.run("DELETE FROM memories WHERE id = ?", [id]);
    });
    return true;
  }

  pruneDialog(maxDialogMemories = 300): number {
    const rows = this.db.all<{ id: number }>(`
      SELECT id
      FROM memories
      WHERE scope = 'dialog'
      ORDER BY updated_at DESC, id DESC
      LIMIT -1 OFFSET ?
    `, [maxDialogMemories]);
    rows.forEach((row) => this.delete(row.id));
    return rows.length;
  }

  search(query: string, limit = 5, scope?: MemoryScope): MemoryRecord[] {
    const terms = tokenizeSearchText(query, 20);
    if (!terms.length) return this.recent(limit, scope);

    const exactPlaceholders = terms.map(() => "?").join(",");
    const prefixClauses = terms.map(() => "mt.term LIKE ?").join(" OR ");
    const scopeFilter = scope ? "AND m.scope = ?" : "";
    const params: unknown[] = [
      ...terms,
      ...terms.map((term) => `${term}%`)
    ];
    if (scope) params.push(scope);
    params.push(limit);

    const rows = this.db.all<MemoryRecord & { score: number }>(`
      SELECT m.*, SUM(mt.weight * m.importance * CASE WHEN m.scope = 'important' THEN 1.5 ELSE 0.65 END) AS score
      FROM memories m
      JOIN memory_search_terms mt ON mt.memory_id = m.id
      WHERE (mt.term IN (${exactPlaceholders}) OR ${prefixClauses})
        ${scopeFilter}
      GROUP BY m.id
      ORDER BY score DESC, m.updated_at DESC
      LIMIT ?
    `, params);

    const now = new Date().toISOString();
    rows.forEach((row) => {
      this.db.run("UPDATE memories SET last_used_at = ? WHERE id = ?", [now, row.id]);
    });
    return rows;
  }

  searchImportant(query: string, limit = 5): MemoryRecord[] {
    return this.search(query, limit, "important");
  }

  searchDialog(query: string, limit = 3): MemoryRecord[] {
    return this.search(query, limit, "dialog");
  }

  private replaceTerms(memory: MemoryRecord): void {
    const terms = weightedTerms([
      { text: memory.scope, weight: 4 },
      { text: memory.kind, weight: 3 },
      { text: memory.content, weight: 1 }
    ], 1000);
    this.db.transaction(() => {
      this.db.run("DELETE FROM memory_search_terms WHERE memory_id = ?", [memory.id]);
      for (const term of terms) {
        this.db.run(`
          INSERT INTO memory_search_terms (memory_id, term, weight)
          VALUES (?, ?, ?)
        `, [memory.id, term.term, term.weight]);
      }
    });
  }
}

function inferScope(kind: string, source: string): MemoryScope {
  return kind === "event" || source === "conversation" ? "dialog" : "important";
}

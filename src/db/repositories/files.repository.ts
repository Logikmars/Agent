import type { SqliteDatabase } from "../sqlite.js";
import { tokenizeSearchText, weightedTerms } from "../searchTerms.js";

export type FileRecord = {
  id: number;
  relative_path: string;
  absolute_path: string;
  name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  file_type: "file" | "directory";
  is_text: 0 | 1;
  is_image: 0 | 1;
  status: "pending" | "indexed" | "skipped" | "error" | "deleted";
  error_message: string | null;
  created_at: string;
  modified_at: string;
  indexed_at: string | null;
};

export type UpsertFileInput = Omit<FileRecord, "id">;

export class FilesRepository {
  constructor(private readonly db: SqliteDatabase) {}

  upsert(input: UpsertFileInput): FileRecord {
    this.db.run(`
      INSERT INTO files (
        relative_path, absolute_path, name, extension, mime_type, size_bytes, file_type,
        is_text, is_image, status, error_message, created_at, modified_at, indexed_at
      )
      VALUES (
        @relative_path, @absolute_path, @name, @extension, @mime_type, @size_bytes, @file_type,
        @is_text, @is_image, @status, @error_message, @created_at, @modified_at, @indexed_at
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        absolute_path = excluded.absolute_path,
        name = excluded.name,
        extension = excluded.extension,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        file_type = excluded.file_type,
        is_text = excluded.is_text,
        is_image = excluded.is_image,
        status = excluded.status,
        error_message = excluded.error_message,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        indexed_at = excluded.indexed_at
    `, input);
    const found = this.findByRelativePath(input.relative_path);
    if (!found) throw new Error("Failed to reload upserted file");
    return found;
  }

  list(limit = 500): FileRecord[] {
    return this.db.all<FileRecord>("SELECT * FROM files WHERE status != 'deleted' ORDER BY file_type, relative_path LIMIT ?", [limit]);
  }

  findByRelativePath(relativePath: string): FileRecord | undefined {
    return this.db.get<FileRecord>("SELECT * FROM files WHERE relative_path = ?", [relativePath]);
  }

  markDeleted(relativePath: string): void {
    const file = this.findByRelativePath(relativePath);
    this.db.run("UPDATE files SET status = 'deleted', indexed_at = ? WHERE relative_path = ?", [new Date().toISOString(), relativePath]);
    if (file) this.db.run("DELETE FROM file_search_terms WHERE file_id = ?", [file.id]);
  }

  search(query: string, extensions: string[] | null, limit: number): FileRecord[] {
    const indexed = this.searchIndexed(query, extensions, limit);
    if (indexed.length) return indexed;
    return this.searchLike(query, extensions, limit);
  }

  replaceSearchTerms(fileId: number, content = ""): void {
    const file = this.db.get<FileRecord>("SELECT * FROM files WHERE id = ?", [fileId]);
    if (!file) return;
    const terms = weightedTerms([
      { text: file.name, weight: 8 },
      { text: file.relative_path, weight: 5 },
      { text: file.extension.replace(/^\./, ""), weight: 3 },
      { text: content, weight: 1 }
    ]);

    this.db.transaction(() => {
      this.db.run("DELETE FROM file_search_terms WHERE file_id = ?", [fileId]);
      if (file.status === "deleted") return;
      for (const term of terms) {
        this.db.run(`
          INSERT INTO file_search_terms (file_id, term, weight)
          VALUES (?, ?, ?)
        `, [fileId, term.term, term.weight]);
      }
    });
  }

  rebuildSearchIndex(): void {
    const rows = this.db.all<FileRecord & { content: string }>(`
      SELECT f.*, COALESCE(GROUP_CONCAT(c.content, ' '), '') AS content
      FROM files f
      LEFT JOIN file_chunks c ON c.file_id = f.id
      WHERE f.status != 'deleted'
      GROUP BY f.id
    `);
    this.db.transaction(() => {
      this.db.run("DELETE FROM file_search_terms");
      for (const row of rows) {
        const terms = weightedTerms([
          { text: row.name, weight: 8 },
          { text: row.relative_path, weight: 5 },
          { text: row.extension.replace(/^\./, ""), weight: 3 },
          { text: row.content, weight: 1 }
        ]);
        for (const term of terms) {
          this.db.run(`
            INSERT INTO file_search_terms (file_id, term, weight)
            VALUES (?, ?, ?)
          `, [row.id, term.term, term.weight]);
        }
      }
    });
  }

  private searchIndexed(query: string, extensions: string[] | null, limit: number): FileRecord[] {
    const terms = tokenizeSearchText(query, 20);
    if (!terms.length) return [];
    const exactPlaceholders = terms.map(() => "?").join(",");
    const prefixClauses = terms.map(() => "st.term LIKE ?").join(" OR ");
    const extensionFilter = extensions?.length ? `AND f.extension IN (${extensions.map(() => "?").join(",")})` : "";
    const params: unknown[] = [
      ...terms,
      ...terms.map((term) => `${term}%`)
    ];
    if (extensions?.length) params.push(...normalizeExtensions(extensions));
    params.push(limit);

    return this.db.all<FileRecord>(`
      SELECT f.*
      FROM files f
      JOIN file_search_terms st ON st.file_id = f.id
      WHERE f.status != 'deleted'
        AND (st.term IN (${exactPlaceholders}) OR ${prefixClauses})
        ${extensionFilter}
      GROUP BY f.id
      ORDER BY COUNT(DISTINCT st.term) DESC, SUM(st.weight) DESC, f.is_text DESC, f.relative_path
      LIMIT ?
    `, params);
  }

  private searchLike(query: string, extensions: string[] | null, limit: number): FileRecord[] {
    const like = `%${query}%`;
    const extensionFilter = extensions?.length ? `AND f.extension IN (${extensions.map(() => "?").join(",")})` : "";
    const params: unknown[] = [like, like, like];
    if (extensions?.length) params.push(...normalizeExtensions(extensions));
    params.push(limit);
    return this.db.all<FileRecord>(`
      SELECT DISTINCT f.*
      FROM files f
      LEFT JOIN file_chunks c ON c.file_id = f.id
      WHERE f.status != 'deleted'
        AND (f.name LIKE ? OR f.relative_path LIKE ? OR c.content LIKE ?)
        ${extensionFilter}
      ORDER BY f.is_text DESC, f.relative_path
      LIMIT ?
    `, params);
  }
}

function normalizeExtensions(extensions: string[]): string[] {
  return extensions.map((ext) => ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`);
}

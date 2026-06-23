import type { SqliteDatabase } from "./sqlite.js";

export function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      relative_path TEXT NOT NULL UNIQUE,
      absolute_path TEXT NOT NULL,
      name TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      is_text INTEGER NOT NULL,
      is_image INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      indexed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS file_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE (file_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_message TEXT NOT NULL,
      assistant_answer TEXT NOT NULL,
      used_files_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_search_terms (
      file_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      weight REAL NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      PRIMARY KEY (file_id, term)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'important',
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_search_terms (
      memory_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      weight REAL NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
      PRIMARY KEY (memory_id, term)
    );

    CREATE INDEX IF NOT EXISTS idx_files_relative_path ON files(relative_path);
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
    CREATE INDEX IF NOT EXISTS idx_chunks_content ON file_chunks(content);
    CREATE INDEX IF NOT EXISTS idx_file_search_terms_term ON file_search_terms(term);
    CREATE INDEX IF NOT EXISTS idx_memory_search_terms_term ON memory_search_terms(term);
  `);

  const memoryColumns = db.all<{ name: string }>("PRAGMA table_info(memories)");
  if (!memoryColumns.some((column) => column.name === "scope")) {
    db.run("ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'important'");
  }
  db.run(`
    UPDATE memories
    SET scope = CASE
      WHEN kind = 'event' OR source = 'conversation' THEN 'dialog'
      ELSE 'important'
    END
    WHERE scope IS NULL OR scope = '' OR scope NOT IN ('important', 'dialog')
  `);
  db.run(`
    UPDATE memories
    SET scope = 'dialog'
    WHERE scope = 'important' AND (kind = 'event' OR source = 'conversation')
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)");
}

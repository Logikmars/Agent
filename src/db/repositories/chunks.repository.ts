import type { SqliteDatabase } from "../sqlite.js";

export type ChunkRecord = {
  id: number;
  file_id: number;
  chunk_index: number;
  content: string;
  content_preview: string;
  token_estimate: number;
  created_at: string;
};

export class ChunksRepository {
  constructor(private readonly db: SqliteDatabase) {}

  replaceForFile(fileId: number, chunks: Array<{ content: string; preview: string; tokenEstimate: number }>): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM file_chunks WHERE file_id = ?", [fileId]);
      chunks.forEach((chunk, index) => {
        this.db.run(`
          INSERT INTO file_chunks (file_id, chunk_index, content, content_preview, token_estimate, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [fileId, index, chunk.content, chunk.preview, chunk.tokenEstimate, new Date().toISOString()]);
      });
    });
  }

  getChunk(fileId: number, chunkIndex: number): ChunkRecord | undefined {
    return this.db.get<ChunkRecord>("SELECT * FROM file_chunks WHERE file_id = ? AND chunk_index = ?", [fileId, chunkIndex]);
  }

  listForFile(fileId: number, limit = 20): ChunkRecord[] {
    return this.db.all<ChunkRecord>("SELECT * FROM file_chunks WHERE file_id = ? ORDER BY chunk_index LIMIT ?", [fileId, limit]);
  }

  search(query: string, limit: number): Array<ChunkRecord & { relative_path: string }> {
    return this.db.all<ChunkRecord & { relative_path: string }>(`
      SELECT c.*, f.relative_path
      FROM file_chunks c
      JOIN files f ON f.id = c.file_id
      WHERE f.status = 'indexed' AND c.content LIKE ?
      ORDER BY f.relative_path, c.chunk_index
      LIMIT ?
    `, [`%${query}%`, limit]);
  }
}

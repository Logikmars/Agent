import type { SqliteDatabase } from "../sqlite.js";

export class ConversationsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(userMessage: string, assistantAnswer: string, usedFiles: unknown): void {
    this.db.run(`
      INSERT INTO conversations (user_message, assistant_answer, used_files_json, created_at)
      VALUES (?, ?, ?, ?)
    `, [userMessage, assistantAnswer, JSON.stringify(usedFiles), new Date().toISOString()]);
  }
}

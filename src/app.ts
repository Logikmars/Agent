import { createDatabase } from "./db/database.js";
import { runMigrations } from "./db/migrations.js";
import { FilesRepository } from "./db/repositories/files.repository.js";
import { ChunksRepository } from "./db/repositories/chunks.repository.js";
import { ConversationsRepository } from "./db/repositories/conversations.repository.js";
import { MemoryRepository } from "./db/repositories/memory.repository.js";
import { PathGuard } from "./safety/pathGuard.js";
import { env } from "./config/env.js";
import { createOpenAIClient } from "./agent/openaiClient.js";
import type { ToolContext } from "./tools/types.js";

export async function createAppContext(): Promise<ToolContext> {
  const db = await createDatabase();
  runMigrations(db);
  return {
    files: new FilesRepository(db),
    chunks: new ChunksRepository(db),
    conversations: new ConversationsRepository(db),
    memories: new MemoryRepository(db),
    guard: new PathGuard(env.watchDir),
    openai: createOpenAIClient()
  };
}

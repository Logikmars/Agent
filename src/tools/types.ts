import type OpenAI from "openai";
import type { FilesRepository } from "../db/repositories/files.repository.js";
import type { ChunksRepository } from "../db/repositories/chunks.repository.js";
import type { ConversationsRepository } from "../db/repositories/conversations.repository.js";
import type { MemoryRepository } from "../db/repositories/memory.repository.js";
import type { PathGuard } from "../safety/pathGuard.js";

export type ToolContext = {
  files: FilesRepository;
  chunks: ChunksRepository;
  conversations: ConversationsRepository;
  memories: MemoryRepository;
  guard: PathGuard;
  openai: OpenAI | null;
};

export type UsedFile = {
  path: string;
  reason: string;
};

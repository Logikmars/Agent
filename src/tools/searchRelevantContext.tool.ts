import { z } from "zod";
import type { ToolContext } from "./types.js";

export const searchRelevantContextSchema = z.object({
  query: z.string().min(1),
  memoryLimit: z.number().int().positive().max(20).default(5),
  importantMemoryLimit: z.number().int().positive().max(20).default(5),
  dialogMemoryLimit: z.number().int().positive().max(20).default(3),
  fileLimit: z.number().int().positive().max(50).default(10),
  chunkLimit: z.number().int().positive().max(30).default(8)
});

export function searchRelevantContextTool(ctx: ToolContext, input: unknown) {
  const args = searchRelevantContextSchema.parse(input);
  const importantMemories = ctx.memories.searchImportant(args.query, args.importantMemoryLimit).map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    updatedAt: memory.updated_at
  }));

  const dialogMemories = ctx.memories.searchDialog(args.query, args.dialogMemoryLimit).map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    updatedAt: memory.updated_at
  }));

  const memories = [...importantMemories, ...dialogMemories].slice(0, args.memoryLimit);

  const files = ctx.files.search(args.query, null, args.fileLimit).map((file) => ({
    path: file.relative_path,
    name: file.name,
    extension: file.extension,
    type: file.file_type,
    status: file.status,
    isText: Boolean(file.is_text),
    isImage: Boolean(file.is_image),
    sizeBytes: file.size_bytes,
    modifiedAt: file.modified_at
  }));

  const chunks = ctx.chunks.search(args.query, args.chunkLimit).map((chunk) => ({
    path: chunk.relative_path,
    chunkIndex: chunk.chunk_index,
    preview: chunk.content_preview,
    tokenEstimate: chunk.token_estimate
  }));

  return { query: args.query, importantMemories, dialogMemories, memories, files, chunks };
}

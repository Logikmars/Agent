import { z } from "zod";
import type { ToolContext } from "./types.js";

export const readFileChunkSchema = z.object({
  relativePath: z.string().min(1),
  chunkIndex: z.number().int().min(0)
});

export function readFileChunkTool(ctx: ToolContext, input: unknown) {
  const args = readFileChunkSchema.parse(input);
  ctx.guard.resolveInside(args.relativePath);
  const file = ctx.files.findByRelativePath(args.relativePath);
  if (!file) throw new Error(`File is not indexed: ${args.relativePath}`);
  if (!file.is_text) throw new Error(`File is not indexed as text: ${args.relativePath}`);
  const chunk = ctx.chunks.getChunk(file.id, args.chunkIndex);
  if (!chunk) throw new Error(`Chunk ${args.chunkIndex} not found for ${args.relativePath}`);
  return {
    path: file.relative_path,
    chunkIndex: chunk.chunk_index,
    content: chunk.content,
    tokenEstimate: chunk.token_estimate
  };
}

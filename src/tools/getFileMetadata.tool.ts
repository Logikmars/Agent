import { z } from "zod";
import type { ToolContext } from "./types.js";

export const getFileMetadataSchema = z.object({
  relativePath: z.string().min(1)
});

export function getFileMetadataTool(ctx: ToolContext, input: unknown) {
  const { relativePath } = getFileMetadataSchema.parse(input);
  ctx.guard.resolveInside(relativePath);
  const file = ctx.files.findByRelativePath(relativePath);
  if (!file) throw new Error(`File is not indexed: ${relativePath}`);
  const chunks = file.is_text ? ctx.chunks.listForFile(file.id, 100).map((chunk) => ({
    chunkIndex: chunk.chunk_index,
    preview: chunk.content_preview,
    tokenEstimate: chunk.token_estimate
  })) : [];
  return { ...file, is_text: Boolean(file.is_text), is_image: Boolean(file.is_image), chunks };
}

import { z } from "zod";
import { MAX_TOOL_LIMIT } from "../safety/limits.js";
import type { ToolContext } from "./types.js";

export const searchFilesSchema = z.object({
  query: z.string().min(1),
  extensions: z.array(z.string()).nullable().default(null),
  limit: z.number().int().positive().max(MAX_TOOL_LIMIT).default(20)
});

export function searchFilesTool(ctx: ToolContext, input: unknown) {
  const args = searchFilesSchema.parse(input);
  return ctx.files.search(args.query, args.extensions, args.limit).map((file) => ({
    path: file.relative_path,
    name: file.name,
    extension: file.extension,
    type: file.file_type,
    status: file.status,
    isText: Boolean(file.is_text),
    isImage: Boolean(file.is_image),
    sizeBytes: file.size_bytes
  }));
}

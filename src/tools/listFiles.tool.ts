import { z } from "zod";
import { DEFAULT_TOOL_LIMIT, MAX_TOOL_LIMIT } from "../safety/limits.js";
import type { ToolContext } from "./types.js";

export const listFilesSchema = z.object({
  directory: z.string().nullable().default(null),
  recursive: z.boolean().default(false),
  limit: z.number().int().positive().max(MAX_TOOL_LIMIT).default(DEFAULT_TOOL_LIMIT)
});

export function listFilesTool(ctx: ToolContext, input: unknown) {
  const args = listFilesSchema.parse(input);
  const directory = args.directory?.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = directory && directory !== "." ? `${directory}/` : "";
  return ctx.files
    .list(args.limit * 5)
    .filter((file) => {
      if (!prefix) return true;
      if (args.recursive) return file.relative_path.startsWith(prefix) || file.relative_path === directory;
      const rest = file.relative_path.slice(prefix.length);
      return file.relative_path === directory || (file.relative_path.startsWith(prefix) && !rest.includes("/"));
    })
    .slice(0, args.limit)
    .map((file) => ({
      path: file.relative_path,
      type: file.file_type,
      sizeBytes: file.size_bytes,
      mimeType: file.mime_type,
      status: file.status,
      isText: Boolean(file.is_text),
      isImage: Boolean(file.is_image),
      modifiedAt: file.modified_at
    }));
}

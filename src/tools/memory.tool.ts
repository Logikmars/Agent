import { z } from "zod";
import type { ToolContext } from "./types.js";

const sensitivePattern = /(api[_-]?key|token|password|парол|секрет|secret|private[_-]?key)/i;

export const recallMemorySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(20).default(5),
  scope: z.enum(["all", "important", "dialog"]).default("all")
});

export const rememberMemorySchema = z.object({
  kind: z.enum(["preference", "fact", "project_note", "rule", "event"]).default("fact"),
  content: z.string().min(3).max(2000),
  importance: z.number().min(0.1).max(5).default(1),
  metadataJson: z.string().default("{}"),
  scope: z.enum(["important", "dialog"]).default("important")
});

export function recallMemoryTool(ctx: ToolContext, input: unknown) {
  const args = recallMemorySchema.parse(input);
  const scope = args.scope === "all" ? undefined : args.scope;
  return ctx.memories.search(args.query, args.limit, scope).map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    source: memory.source,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at
  }));
}

export function rememberMemoryTool(ctx: ToolContext, input: unknown) {
  const args = rememberMemorySchema.parse(input);
  if (sensitivePattern.test(args.content)) {
    return {
      saved: false,
      reason: "Potentially sensitive secrets are not stored in long-term memory."
    };
  }
  const metadata = parseMetadata(args.metadataJson);
  const memory = ctx.memories.create(args.kind, args.content, metadata, args.importance, "tool", args.scope);
  return {
    saved: true,
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content
  };
}

function parseMetadata(metadataJson: string): unknown {
  try {
    return JSON.parse(metadataJson);
  } catch {
    return { raw: metadataJson };
  }
}

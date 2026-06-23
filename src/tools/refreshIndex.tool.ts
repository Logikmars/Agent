import { z } from "zod";
import type { ToolContext } from "./types.js";
import { scanFolder } from "../scanner/scanFolder.js";

export const refreshIndexSchema = z.object({
  force: z.boolean().default(false)
});

export async function refreshIndexTool(ctx: ToolContext, input: unknown) {
  refreshIndexSchema.parse(input);
  await scanFolder(ctx);
  return { status: "ok" };
}

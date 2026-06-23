import type { ToolContext } from "../tools/types.js";
import { listFilesTool } from "../tools/listFiles.tool.js";
import { getFileTreeTool } from "../tools/getFileTree.tool.js";
import { searchFilesTool } from "../tools/searchFiles.tool.js";
import { readFileChunkTool } from "../tools/readFileChunk.tool.js";
import { getFileMetadataTool } from "../tools/getFileMetadata.tool.js";
import { analyzeImageTool } from "../tools/analyzeImage.tool.js";
import { refreshIndexTool } from "../tools/refreshIndex.tool.js";
import { recallMemoryTool, rememberMemoryTool } from "../tools/memory.tool.js";
import { searchRelevantContextTool } from "../tools/searchRelevantContext.tool.js";

export async function runTool(ctx: ToolContext, name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case "list_files":
      return listFilesTool(ctx, args);
    case "get_file_tree":
      return getFileTreeTool(ctx, args);
    case "search_files":
      return searchFilesTool(ctx, args);
    case "search_relevant_context":
      return searchRelevantContextTool(ctx, args);
    case "read_file_chunk":
      return readFileChunkTool(ctx, args);
    case "get_file_metadata":
      return getFileMetadataTool(ctx, args);
    case "analyze_image":
      return analyzeImageTool(ctx, args);
    case "refresh_index":
      return refreshIndexTool(ctx, args);
    case "recall_memory":
      return recallMemoryTool(ctx, args);
    case "remember_memory":
      return rememberMemoryTool(ctx, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

import { z } from "zod";
import type { ToolContext } from "./types.js";

export const getFileTreeSchema = z.object({
  maxDepth: z.number().int().min(1).max(20).default(6)
});

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
};

export function getFileTreeTool(ctx: ToolContext, input: unknown): TreeNode {
  const { maxDepth } = getFileTreeSchema.parse(input);
  const root: TreeNode = { name: ".", path: ".", type: "directory", children: [] };

  for (const file of ctx.files.list(5000)) {
    if (file.relative_path === ".") continue;
    const parts = file.relative_path.split("/");
    if (parts.length > maxDepth) continue;
    let node = root;
    parts.forEach((part, index) => {
      node.children ??= [];
      const currentPath = parts.slice(0, index + 1).join("/");
      let next = node.children.find((child) => child.name === part);
      if (!next) {
        next = {
          name: part,
          path: currentPath,
          type: index === parts.length - 1 ? file.file_type : "directory",
          children: index === parts.length - 1 && file.file_type === "file" ? undefined : []
        };
        node.children.push(next);
      }
      node = next;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  node.children?.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  node.children?.forEach(sortTree);
}

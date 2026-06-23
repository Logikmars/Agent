import fs from "node:fs/promises";
import { createAppContext } from "./app.js";
import { env } from "./config/env.js";
import { scanFolder } from "./scanner/scanFolder.js";
import { askAgent } from "./agent/agent.js";
import { getFileTreeTool } from "./tools/getFileTree.tool.js";

async function main() {
  await fs.mkdir(env.watchDir, { recursive: true });
  const ctx = await createAppContext();
  const [command, ...rest] = process.argv.slice(2);

  if (command === "rescan") {
    await scanFolder(ctx);
    console.log(JSON.stringify({ status: "ok" }, null, 2));
    return;
  }

  if (command === "tree") {
    await scanFolder(ctx);
    console.log(JSON.stringify(getFileTreeTool(ctx, { maxDepth: 20 }), null, 2));
    return;
  }

  if (command === "ask") {
    await scanFolder(ctx);
    const question = rest.join(" ").trim();
    if (!question) throw new Error('Usage: npm run ask "что находится в папке?"');
    const result = await askAgent(ctx, question);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error("Usage: npm run rescan | npm run tree | npm run ask \"question\"");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
